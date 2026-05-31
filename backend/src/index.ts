import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient, UserRole, ResourceType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import iconv from 'iconv-lite';
import { verifyToken, AuthRequest } from './authMiddleware';
import { checkCollision } from './utils/scheduling';
import { performMove } from './utils/lessonOperations';

const app = express();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const port = process.env.PORT || 3001;
const host = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// --- Audit Log Helper ---
const createAuditLog = async (req: AuthRequest, tableName: string, action: string, data: any, courseId?: string, lessonId?: string) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId: req.user?.id,
        userEmail: req.user?.email,
        tableName,
        action,
        data: typeof data === 'string' ? data : JSON.stringify(data),
        courseId,
        lessonId
      }
    });
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
};

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// --- Helper for Authorization ---
const canManageCourseLessons = async (userId: string, courseId: string): Promise<boolean> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { resource: true }
  });

  if (!user) return false;
  if (user.role === UserRole.ADMIN) return true;
  if (user.role !== UserRole.TEACHER || !user.resource) return false;

  const teacherResourceId = user.resource.id;

  const course = await prisma.resource.findUnique({
    where: { id: courseId },
    include: { assistantTeachers: { select: { id: true } } }
  });

  if (!course || course.type !== ResourceType.course) return false;

  const isChief = course.chiefTeacherId === teacherResourceId;
  const isAssistant = course.assistantTeachers.some(t => t.id === teacherResourceId);

  return isChief || isAssistant;
};

// --- Authentication Routes ---

// User registration
app.post('/api/auth/register', async (req, res) => {
  const { email, password, role } = req.body;
  try {
    const settings = await prisma.systemSetting.findFirst();
    if (settings && !settings.allowPublicSignup) {
      return res.status(403).json({ error: 'Public signup is disabled' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: role || UserRole.STUDENT
      }
    });
    await createAuditLog(req as AuthRequest, 'User', 'REGISTER', { id: user.id, email: user.email, role: user.role });
    res.json({ message: 'User created successfully', userId: user.id });
  } catch (error) {
    res.status(400).json({ error: 'User already exists or invalid data' });
  }
});

// Change password (self)
app.post('/api/auth/change-password', verifyToken, async (req: AuthRequest, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) return res.status(400).json({ error: 'Invalid current password' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    });
    await createAuditLog(req, 'User', 'CHANGE_PASSWORD', { id: user.id, email: user.email });
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ 
      where: { email },
      include: { resource: { select: { id: true } } }
    });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
    const decoded = jwt.decode(token) as { exp: number };
    const expiresAt = decoded.exp * 1000;
    
    // Save to Cookie
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // or 'strict'
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.json({
      user: { id: user.id, email: user.email, role: user.role, resourceId: user.resource?.id },
      expiresAt
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ message: 'Logged out successfully' });
});

// OIDC Login
app.get('/api/auth/sso/login', async (req, res) => {
  const settings = await prisma.systemSetting.findFirst();
  if (!settings?.ssoEnabled || !settings.ssoIssuerUrl || !settings.ssoClientId) {
    return res.status(400).json({ error: 'SSO not configured' });
  }
  const redirectUri = `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/auth/sso/callback`;
  const authUrl = `${settings.ssoIssuerUrl}/protocol/openid-connect/auth?client_id=${settings.ssoClientId}&response_type=code&scope=openid email profile&redirect_uri=${encodeURIComponent(redirectUri)}`;
  res.redirect(authUrl);
});

// OIDC Callback
app.get('/api/auth/sso/callback', async (req, res) => {
  const { code } = req.query;
  const settings = await prisma.systemSetting.findFirst();
  if (!settings?.ssoEnabled || !settings.ssoIssuerUrl || !settings.ssoClientId || !settings.ssoClientSecret) {
    return res.status(400).json({ error: 'SSO not configured' });
  }

  try {
    // 1. Exchange code for tokens
    const tokenResponse = await fetch(`${settings.ssoIssuerUrl}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: settings.ssoClientId,
        client_secret: settings.ssoClientSecret,
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/auth/sso/callback`
      })
    });
    
    if (!tokenResponse.ok) return res.status(400).json({ error: 'Token exchange failed' });
    const tokens = await tokenResponse.json();
    
    // 2. Decode and verify ID token (simplified for now, assume JWT is valid)
    const decodedIdToken = jwt.decode(tokens.id_token) as any;
    const { email, sub } = decodedIdToken;

    // 3. Find or create user
    let user = await prisma.user.findFirst({ where: { OR: [{ email }, { ssoId: sub }] } });

    if (!user) {
      if (!settings.ssoAutoProvisioning) return res.status(403).json({ error: 'User provisioning disabled' });
      // Create new user (role: STUDENT)
      const hashedPassword = await bcrypt.hash(Math.random().toString(36), 10);
      user = await prisma.user.create({
        data: { email, password: hashedPassword, role: UserRole.STUDENT, ssoId: sub }
      });
    } else if (!user.ssoId) {
      // Link ssoId
      user = await prisma.user.update({ where: { id: user.id }, data: { ssoId: sub } });
    }

    // 4. Create session and redirect
    const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    res.redirect(`${FRONTEND_URL}/`);
  } catch (error) {
    console.error('SSO Callback error:', error);
    res.status(500).json({ error: 'SSO authentication failed' });
  }
});

// Check session (get own user info)
app.get('/api/auth/me', verifyToken, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { 
        id: true, 
        email: true, 
        role: true, 
        resource: { select: { id: true } } 
      }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      resourceId: user.resource?.id,
      expiresAt: req.user.exp ? req.user.exp * 1000 : undefined
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// --- Protected Routes ---

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'ScholaTile Backend is running' });
});

// Fetch resources (Auth required)
app.get('/api/resources', verifyToken, async (req, res) => {
  try {
    const resources = await prisma.resource.findMany({
      include: {
        subjects: {
          include: { subject: true }
        },
        assistantTeachers: { select: { id: true } },
        courseType: true,
        equipments: {
          include: { equipment: true }
        }
      },
      orderBy: { order: 'asc' }
    });
    res.json(resources);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch resources' });
  }
});

// Fetch users (ADMIN required)
app.get('/api/users', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, role: true }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create/Update user (ADMIN required)
app.post('/api/users', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { id, email, password, role } = req.body;
  try {
    let user;
    if (id) {
      // Update
      const data: any = { email, role };
      if (password) {
        data.password = await bcrypt.hash(password, 10);
      }
      user = await prisma.user.update({
        where: { id },
        data,
        select: { id: true, email: true, role: true }
      });
      await createAuditLog(req, 'User', 'UPDATE', user);
    } else {
      // Create
      const hashedPassword = await bcrypt.hash(password, 10);
      user = await prisma.user.create({
        data: { email, password: hashedPassword, role },
        select: { id: true, email: true, role: true }
      });
      await createAuditLog(req, 'User', 'CREATE', user);
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save user' });
  }
});

// Delete user (ADMIN required)
app.delete('/api/users/:id', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { id } = req.params;
  try {
    // Prevent deleting self
    if (req.user.id === id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }
    const user = await prisma.user.delete({ where: { id } });
    await createAuditLog(req, 'User', 'DELETE', { id, email: user.email });
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Password reset by admin (ADMIN required)
app.post('/api/users/:id/reset-password', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { id } = req.params;
  const { newPassword } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const user = await prisma.user.update({
      where: { id },
      data: { password: hashedPassword }
    });
    await createAuditLog(req, 'User', 'RESET_PASSWORD', { id, email: user.email });
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Fetch system settings
app.get('/api/settings', async (req, res) => {
  try {
    let settings = await prisma.systemSetting.findFirst();
    if (!settings) {
      settings = await prisma.systemSetting.create({ 
        data: { 
          allowPublicSignup: true,
          yearViewStartMonth: 4,
          yearViewStartDay: 1,
          weekendDays: "0,6",
          holidayTheme: "default"
        } 
      });
    }
    // Exclude sensitive secret from response, or mask it
    const { ssoClientSecret, ...settingsWithoutSecret } = settings;
    res.json({
      ...settingsWithoutSecret,
      ssoClientSecret: ssoClientSecret ? '********' : null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update system settings (ADMIN required)
app.post('/api/settings', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { allowPublicSignup, yearViewStartMonth, yearViewStartDay, weekendDays, holidayTheme, ssoEnabled, ssoForceRedirect, ssoClientId, ssoClientSecret, ssoIssuerUrl, ssoAllowedDomain, ssoAutoProvisioning } = req.body;
  try {
    let settings = await prisma.systemSetting.findFirst();
    const data: any = {
      allowPublicSignup,
      yearViewStartMonth: parseInt(yearViewStartMonth) || 4,
      yearViewStartDay: parseInt(yearViewStartDay) || 1,
      weekendDays: weekendDays || "0,6",
      holidayTheme: holidayTheme || "default",
      ssoEnabled: !!ssoEnabled,
      ssoForceRedirect: !!ssoForceRedirect,
      ssoClientId: ssoClientId || null,
      ssoIssuerUrl: ssoIssuerUrl || null,
      ssoAllowedDomain: ssoAllowedDomain || null,
      ssoAutoProvisioning: !!ssoAutoProvisioning
    };

    if (ssoClientSecret !== '********') {
      data.ssoClientSecret = ssoClientSecret || null;
    }

    if (settings) {
      settings = await prisma.systemSetting.update({
        where: { id: settings.id },
        data
      });
    } else {
      settings = await prisma.systemSetting.create({
        data
      });
    }
    await createAuditLog(req, 'SystemSetting', 'UPDATE', settings);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// Create/Update room (ADMIN or EQUIPMENT_MANAGER required)
app.post('/api/rooms', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN && req.user?.role !== UserRole.EQUIPMENT_MANAGER) {
    return res.status(403).json({ error: 'Access denied. Admin or Equipment Manager role required.' });
  }
  const { id, name, order, equipments, capacity } = req.body;
  try {
    let room;
    if (id) {
      room = await prisma.resource.update({
        where: { id },
        data: {
          name,
          order: order || 0,
          capacity: capacity ? parseInt(capacity) : null,
          equipments: {
            deleteMany: {},
            create: equipments?.map((e: any) => ({
              equipmentId: e.equipmentId,
              quantity: e.quantity || 1
            })) || []
          }
        },
        include: { equipments: { include: { equipment: true } } }
      });
      await createAuditLog(req, 'Resource', 'UPDATE_ROOM', room);
    } else {
      room = await prisma.resource.create({
        data: {
          name,
          type: ResourceType.room,
          order: order || 0,
          capacity: capacity ? parseInt(capacity) : null,
          equipments: {
            create: equipments?.map((e: any) => ({
              equipmentId: e.equipmentId,
              quantity: e.quantity || 1
            })) || []
          }
        },
        include: { equipments: { include: { equipment: true } } }
      });
      await createAuditLog(req, 'Resource', 'CREATE_ROOM', room);
    }
    res.json(room);
  } catch (error) {
    console.error('Failed to save room:', error);
    res.status(500).json({ error: 'Failed to save room' });
  }
});

// Update room order (ADMIN or EQUIPMENT_MANAGER required)
app.post('/api/rooms/reorder', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN && req.user?.role !== UserRole.EQUIPMENT_MANAGER) {
    return res.status(403).json({ error: 'Access denied. Admin or Equipment Manager role required.' });
  }
  const { orders } = req.body; // Array of { id, order }
  try {
    await prisma.$transaction(
      orders.map((o: any) => 
        prisma.resource.update({
          where: { id: o.id },
          data: { order: o.order }
        })
      )
    );
    await createAuditLog(req, 'Resource', 'REORDER_ROOMS', orders);
    res.json({ message: 'Order updated successfully' });
  } catch (error) {
    console.error('Failed to update room order:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// Delete room (ADMIN or EQUIPMENT_MANAGER required)
app.delete('/api/rooms/:id', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN && req.user?.role !== UserRole.EQUIPMENT_MANAGER) {
    return res.status(403).json({ error: 'Access denied. Admin or Equipment Manager role required.' });
  }
  const { id } = req.params;
  try {
    const room = await prisma.resource.delete({
      where: { id }
    });
    await createAuditLog(req, 'Resource', 'DELETE_ROOM', room);
    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    console.error('Failed to delete room:', error);
    res.status(500).json({ error: 'Failed to delete room' });
  }
});

// Create/Update teacher (ADMIN required)
app.post('/api/teachers', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { id, name, order, userId } = req.body;
  try {
    let teacher;
    if (id) {
      teacher = await prisma.resource.update({
        where: { id },
        data: {
          name,
          order: order || 0,
          userId: userId || null
        }
      });
      await createAuditLog(req, 'Resource', 'UPDATE_TEACHER', teacher);
    } else {
      teacher = await prisma.resource.create({
        data: {
          name,
          type: ResourceType.teacher,
          order: order || 0,
          userId: userId || null
        }
      });
      await createAuditLog(req, 'Resource', 'CREATE_TEACHER', teacher);
    }
    res.json(teacher);
  } catch (error) {
    console.error('Failed to save teacher:', error);
    res.status(500).json({ error: 'Failed to save teacher' });
  }
});

// Update teacher order (ADMIN required)
app.post('/api/teachers/reorder', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { orders } = req.body; // Array of { id, order }
  try {
    await prisma.$transaction(
      orders.map((o: any) =>
        prisma.resource.update({
          where: { id: o.id },
          data: { order: o.order }
        })
      )
    );
    await createAuditLog(req, 'Resource', 'REORDER_TEACHERS', orders);
    res.json({ message: 'Order updated successfully' });
  } catch (error) {
    console.error('Failed to update teacher order:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// Delete teacher (ADMIN required)
app.delete('/api/teachers/:id', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { id } = req.params;
  try {
    const teacher = await prisma.resource.delete({
      where: { id }
    });
    await createAuditLog(req, 'Resource', 'DELETE_TEACHER', teacher);
    res.json({ message: 'Teacher deleted successfully' });
  } catch (error) {
    console.error('Failed to delete teacher:', error);
    res.status(500).json({ error: 'Failed to delete teacher' });
  }
});

// Create/Update course (ADMIN required)
app.post('/api/courses', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { id, name, order, startDate, endDate, subjects, mainRoomId, chiefTeacherId, assistantTeacherIds, mainTeacherLabel, subTeacherLabel, courseTypeId } = req.body;
  try {
    let course;
    const commonData = {
      name,
      order: order || 0,
      startDate,
      endDate,
      mainRoomId: mainRoomId || null,
      chiefTeacherId: chiefTeacherId || null,
      mainTeacherLabel: mainTeacherLabel || null,
      subTeacherLabel: subTeacherLabel || null,
      courseTypeId: courseTypeId || null,
    };

    const subTeachersConnect = assistantTeacherIds?.map((tid: string) => ({ id: tid })) || [];

    if (id) {
      // Update
      course = await prisma.resource.update({
        where: { id },
        data: {
          ...commonData,
          subjects: {
            deleteMany: {},
            create: subjects.map((s: any) => ({
              name: s.name || null,
              totalPeriods: s.totalPeriods || 0,
              subjectId: s.subjectId || null
            }))
          },
          assistantTeachers: {
            set: [],
            connect: subTeachersConnect
          }
        },
        include: { subjects: true, assistantTeachers: true }
      });
      await createAuditLog(req, 'Resource', 'UPDATE_COURSE', course);
    } else {
      // Create
      course = await prisma.resource.create({
        data: {
          ...commonData,
          subjects: {
            create: subjects.map((s: any) => ({
              name: s.name || null,
              totalPeriods: s.totalPeriods || 0,
              subjectId: s.subjectId || null
            }))
          },
          type: ResourceType.course,
          assistantTeachers: {
            connect: subTeachersConnect
          }
        },
        include: { subjects: true, assistantTeachers: true }
      });
      await createAuditLog(req, 'Resource', 'CREATE_COURSE', course);
    }
    res.json(course);
  } catch (error) {
    console.error('Failed to save course:', error);
    res.status(500).json({ error: 'Failed to save course' });
  }
});

// Delete course (ADMIN required)
app.delete('/api/courses/:id', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { id } = req.params;
  try {
    const course = await prisma.resource.delete({
      where: { id }
    });
    await createAuditLog(req, 'Resource', 'DELETE_COURSE', course, id);
    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete course' });
  }
});

// Update course order (ADMIN required)
app.post('/api/courses/reorder', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { orders } = req.body; // Array of { id, order }
  try {
    await prisma.$transaction(
      orders.map((o: any) =>
        prisma.resource.update({
          where: { id: o.id },
          data: { order: o.order }
        })
      )
    );
    await createAuditLog(req, 'Resource', 'REORDER_COURSES', orders);
    res.json({ message: 'Order updated successfully' });
  } catch (error) {
    console.error('Failed to update course order:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// Clone course (ADMIN required)
app.post('/api/courses/:id/duplicate', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { id } = req.params;
  try {
    // Get original course (including related subjects and sub teachers)
    const original = await prisma.resource.findUnique({
      where: { id },
      include: {
        subjects: true,
        assistantTeachers: true
      }
    });

    if (!original || original.type !== ResourceType.course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Create new course (using transaction)
    const duplicated = await prisma.$transaction(async (tx) => {
      // 1. Create new course resource
      const newCourse = await tx.resource.create({
        data: {
          name: `${original.name} (Copy)`,
          type: ResourceType.course,
          order: (original.order || 0) + 1, // Place at next position of original course
          startDate: original.startDate,
          endDate: original.endDate,
          mainRoomId: original.mainRoomId,
          chiefTeacherId: original.chiefTeacherId,
          mainTeacherLabel: original.mainTeacherLabel,
          subTeacherLabel: original.subTeacherLabel,
          courseTypeId: original.courseTypeId,
          assistantTeachers: {
            connect: original.assistantTeachers.map(t => ({ id: t.id }))
          }
        }
      });

      // 2. Clone subjects
      if (original.subjects.length > 0) {
        await tx.courseSubject.createMany({
          data: original.subjects.map(s => ({
            name: s.name,
            totalPeriods: s.totalPeriods,
            subjectId: s.subjectId,
            resourceId: newCourse.id
          }))
        });
      }

      return await tx.resource.findUnique({
        where: { id: newCourse.id },
        include: { subjects: true, assistantTeachers: true }
      });
    });

    await createAuditLog(req, 'Resource', 'DUPLICATE_COURSE', { originalId: id, duplicatedId: duplicated?.id });
    res.json(duplicated);
  } catch (error) {
    console.error('Failed to duplicate course:', error);
    res.status(500).json({ error: 'Failed to duplicate course' });
  }
});

// Clone lessons between courses (ADMIN / Course Chief or Assistant Teacher)
app.post('/api/courses/:id/duplicate-lessons', verifyToken, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { id: destinationCourseId } = req.params;
  const { sourceCourseId, startDate, endDate } = req.body;

  try {
    // Check permission (for target course)
    const hasPermission = await canManageCourseLessons(req.user.id, destinationCourseId);
    if (!hasPermission) return res.status(403).json({ error: 'Access denied to destination course.' });

    // Get target course info
    const destinationCourse = await prisma.resource.findUnique({
      where: { id: destinationCourseId }
    });
    if (!destinationCourse || destinationCourse.type !== ResourceType.course) {
      return res.status(404).json({ error: 'Destination course not found.' });
    }

    // Date range validation
    if (destinationCourse.startDate && startDate < destinationCourse.startDate) {
      return res.status(400).json({ error: `Start date cannot be before ${destinationCourse.startDate}` });
    }
    if (destinationCourse.endDate && endDate > destinationCourse.endDate) {
      return res.status(400).json({ error: `End date cannot be after ${destinationCourse.endDate}` });
    }

    // Get all time periods (for absolute time calculation)
    const periods = await prisma.timePeriod.findMany({ orderBy: { order: 'asc' } });

    // Get source lessons
    const sourceLessons = await prisma.lesson.findMany({
      where: {
        courseId: sourceCourseId,
        startDate: { gte: startDate },
        endDate: { lte: endDate }
      },
      include: { deliveryMethods: { select: { id: true } } }
    });

    // Get target existing lessons (for duplication check)
    const existingLessons = await prisma.lesson.findMany({
      where: { courseId: destinationCourseId }
    });

    let count = 0;
    for (const sL of sourceLessons) {
      const sStart = `${sL.startDate}-${periods.findIndex((p: any) => p.id === sL.startPeriodId).toString().padStart(3, '0')}`;
      const sEnd = `${sL.endDate}-${periods.findIndex((p: any) => p.id === sL.endPeriodId).toString().padStart(3, '0')}`;

      // Duplication check
      const isOverlapping = checkCollision(sStart, sEnd, existingLessons, periods as any);

      if (!isOverlapping) {
        await prisma.lesson.create({
          data: {
            subject: sL.subject,
            subjectRef: sL.subjectId ? { connect: { id: sL.subjectId } } : undefined,
            startDate: sL.startDate,
            startPeriodId: sL.startPeriodId,
            endDate: sL.endDate,
            endPeriodId: sL.endPeriodId,
            location: sL.location,
            remarks: sL.remarks,
            externalTeacher: sL.externalTeacher,
            externalSubTeachers: sL.externalSubTeachers,
            course: { connect: { id: destinationCourseId } },
            room: destinationCourse.mainRoomId ? { connect: { id: destinationCourse.mainRoomId } } : undefined,
            deliveryMethods: {
              connect: sL.deliveryMethods.map(m => ({ id: m.id }))
            }
          }
        });
        count++;
      }
    }

    await createAuditLog(req, 'Lesson', 'DUPLICATE_LESSONS', { sourceCourseId, destinationCourseId, startDate, endDate, count });
    res.json({ message: `Successfully duplicated ${count} lessons.`, count });
  } catch (error) {
    console.error('Failed to duplicate lessons:', error);
    res.status(500).json({ error: 'Failed to duplicate lessons' });
  }
});

// Batch Clone lessons between courses (ADMIN / Course Chief or Assistant Teacher)
app.post('/api/courses/duplicate-lessons-batch', verifyToken, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { sourceCourseId, destinationCourseIds, startDate, endDate } = req.body;

  if (!Array.isArray(destinationCourseIds) || destinationCourseIds.length === 0) {
    return res.status(400).json({ error: 'Destination courses must be provided as an array.' });
  }

  try {
    // Check permission for all target courses
    for (const dId of destinationCourseIds) {
      const hasPermission = await canManageCourseLessons(req.user.id, dId);
      if (!hasPermission) return res.status(403).json({ error: `Access denied to destination course: ${dId}` });
    }

    // Get source lessons
    const sourceLessons = await prisma.lesson.findMany({
      where: {
        courseId: sourceCourseId,
        startDate: { gte: startDate },
        endDate: { lte: endDate }
      },
      include: { deliveryMethods: { select: { id: true } } }
    });

    const periods = await prisma.timePeriod.findMany({ orderBy: { order: 'asc' } });
    let totalCount = 0;

    for (const destinationCourseId of destinationCourseIds) {
      // Get target course info
      const destinationCourse = await prisma.resource.findUnique({
        where: { id: destinationCourseId }
      });
      if (!destinationCourse || destinationCourse.type !== ResourceType.course) {
        continue;
      }

      // Date range validation
      if (destinationCourse.startDate && startDate < destinationCourse.startDate) {
        continue;
      }
      if (destinationCourse.endDate && endDate > destinationCourse.endDate) {
        continue;
      }

      // Get target existing lessons (for duplication check)
      const existingLessons = await prisma.lesson.findMany({
        where: { courseId: destinationCourseId }
      });

      for (const sL of sourceLessons) {
        const sStart = `${sL.startDate}-${periods.findIndex((p: any) => p.id === sL.startPeriodId).toString().padStart(3, '0')}`;
        const sEnd = `${sL.endDate}-${periods.findIndex((p: any) => p.id === sL.endPeriodId).toString().padStart(3, '0')}`;

        // Duplication check
        const isOverlapping = checkCollision(sStart, sEnd, existingLessons, periods as any);

        if (!isOverlapping) {
          await prisma.lesson.create({
            data: {
              subject: sL.subject,
              subjectRef: sL.subjectId ? { connect: { id: sL.subjectId } } : undefined,
              startDate: sL.startDate,
              startPeriodId: sL.startPeriodId,
              endDate: sL.endDate,
              endPeriodId: sL.endPeriodId,
              location: sL.location,
              remarks: sL.remarks,
              externalTeacher: sL.externalTeacher,
              externalSubTeachers: sL.externalSubTeachers,
              course: { connect: { id: destinationCourseId } },
              room: destinationCourse.mainRoomId ? { connect: { id: destinationCourse.mainRoomId } } : undefined,
              deliveryMethods: {
                connect: sL.deliveryMethods.map(m => ({ id: m.id }))
              }
            }
          });
          totalCount++;
        }
      }
      await createAuditLog(req, 'Lesson', 'DUPLICATE_LESSONS_BATCH', { sourceCourseId, destinationCourseId, startDate, endDate });
    }

    res.json({ message: `Successfully duplicated ${totalCount} lessons across ${destinationCourseIds.length} courses.`, count: totalCount });
  } catch (error) {
    console.error('Failed to duplicate lessons batch:', error);
    res.status(500).json({ error: 'Failed to duplicate lessons' });
  }
});

// Fetch lessons (Auth required)
app.get('/api/lessons', verifyToken, async (req, res) => {
  try {
    const lessons = await prisma.lesson.findMany({
      include: {
        subTeachers: {
          select: { id: true }
        },
        deliveryMethods: {
          select: { id: true, name: true, color: true }
        }
      }
    });
    res.json(lessons);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
});

// Create/Update lesson (ADMIN / Course Chief or Assistant Teacher)
app.post('/api/lessons', verifyToken, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  
  const { id, subject, subjectId, teacherId, subTeacherIds, roomId, courseId, location, startDate, startPeriodId, endDate, endPeriodId, deliveryMethodIds, remarks, externalTeacher, externalSubTeachers } = req.body;

  try {
    // Permission check
    if (id) {
      // When updating: check permission for current lesson's course
      const currentLesson = await prisma.lesson.findUnique({ 
        where: { id },
        include: { subTeachers: { select: { id: true } } }
      });
      if (!currentLesson) return res.status(404).json({ error: 'Lesson not found' });
      
      const hasPermissionToCurrent = await canManageCourseLessons(req.user.id, currentLesson.courseId);
      
      // Add: Flag to allow only editing delivery method and remarks if the user is a lesson teacher (main or sub)
      let onlyDeliveryMethodAndRemarksAllowed = false;
      if (!hasPermissionToCurrent && req.user.role === UserRole.TEACHER) {
        const user = await prisma.user.findUnique({
          where: { id: req.user.id },
          include: { resource: true }
        });
        const teacherResourceId = user?.resource?.id;
        if (teacherResourceId) {
          const isMain = currentLesson.teacherId === teacherResourceId;
          const isSub = currentLesson.subTeachers.some(t => t.id === teacherResourceId);
          if (isMain || isSub) {
            onlyDeliveryMethodAndRemarksAllowed = true;
          }
        }
      }

      if (!hasPermissionToCurrent && !onlyDeliveryMethodAndRemarksAllowed) {
        return res.status(403).json({ error: 'Access denied.' });
      }

      // If course is changed, check permission for target course too
      if (courseId && courseId !== currentLesson.courseId) {
        if (onlyDeliveryMethodAndRemarksAllowed) {
           return res.status(403).json({ error: 'Access denied. You can only change delivery methods and remarks for this lesson.' });
        }
        const hasPermissionToNew = await canManageCourseLessons(req.user.id, courseId);
        if (!hasPermissionToNew) return res.status(403).json({ error: 'Access denied to new course.' });
      }

      // If permission is "delivery method and remarks only", check if other fields were changed
      if (onlyDeliveryMethodAndRemarksAllowed) {
        const isOtherFieldChanged = 
          subject !== currentLesson.subject ||
          teacherId !== currentLesson.teacherId ||
          roomId !== currentLesson.roomId ||
          location !== currentLesson.location ||
          startDate !== currentLesson.startDate ||
          startPeriodId !== currentLesson.startPeriodId ||
          endDate !== currentLesson.endDate ||
          endPeriodId !== currentLesson.endPeriodId ||
          // remarks are allowed, so exclude
          externalTeacher !== currentLesson.externalTeacher ||
          externalSubTeachers !== currentLesson.externalSubTeachers ||
          // Sub teacher change check (simplified)
          (subTeacherIds && (
            subTeacherIds.length !== currentLesson.subTeachers.length ||
            !subTeacherIds.every((id: string) => currentLesson.subTeachers.some(t => t.id === id))
          ));
        
        if (isOtherFieldChanged) {
          return res.status(403).json({ error: 'Access denied. You can only change delivery methods and remarks for this lesson.' });
        }
      }
    } else {
      // On creation: check if user has permissions for the specified course
      if (!courseId) return res.status(400).json({ error: 'courseId is required' });
      const hasPermission = await canManageCourseLessons(req.user.id, courseId);
      if (!hasPermission) return res.status(403).json({ error: 'Access denied.' });
    }

    const subTeachersConnect = subTeacherIds?.map((tid: string) => ({ id: tid })) || [];
    const deliveryMethodsConnect = deliveryMethodIds?.map((did: string) => ({ id: did })) || [];
    
    // Common data
    const commonData: any = {
      subject,
      location: location || null,
      startDate,
      startPeriodId,
      endDate,
      endPeriodId,
      remarks: remarks || null,
      externalTeacher: externalTeacher || null,
      externalSubTeachers: externalSubTeachers || null,
    };

    if (subjectId) {
      commonData.subjectRef = { connect: { id: subjectId } };
    } else {
      // If we are updating and subjectId is null, disconnect
      if (id) commonData.subjectRef = { disconnect: true };
    }

    if (id) {
      // Update (Update)
      const data: any = {
        ...commonData,
        course: { connect: { id: courseId } },
        subTeachers: {
          set: [],
          connect: subTeachersConnect
        },
        deliveryMethods: {
          set: [],
          connect: deliveryMethodsConnect
        }
      };

      if (teacherId) {
        data.teacher = { connect: { id: teacherId } };
      } else {
        data.teacher = { disconnect: true };
      }

      if (roomId) {
        data.room = { connect: { id: roomId } };
      } else {
        data.room = { disconnect: true };
      }

      const includeFields = { subTeachers: true, deliveryMethods: true };
      const oldLesson = await prisma.lesson.findUnique({
        where: { id },
        include: includeFields
      });

      const lesson = await prisma.lesson.update({
        where: { id },
        data,
        include: includeFields
      });
      await createAuditLog(req, 'Lesson', 'UPDATE_LESSON', { old: oldLesson, new: lesson });
      res.json(lesson);
    } else {
      // Create (Create)
      const data: any = {
        ...commonData,
        course: { connect: { id: courseId } },
        subTeachers: {
          connect: subTeachersConnect
        },
        deliveryMethods: {
          connect: deliveryMethodsConnect
        }
      };

      if (teacherId) {
        data.teacher = { connect: { id: teacherId } };
      }
      if (roomId) {
        data.room = { connect: { id: roomId } };
      }

      const lesson = await prisma.lesson.create({
        data,
        include: { subTeachers: true, deliveryMethods: true }
      });
      await createAuditLog(req, 'Lesson', 'CREATE_LESSON', { new: lesson }, lesson.courseId, lesson.id);
      res.json(lesson);
    }
  } catch (error) {
    console.error('Failed to save lesson:', error);
    res.status(500).json({ error: 'Failed to save lesson' });
  }
});

// Bulk create lessons
app.post('/api/lessons/batch', verifyToken, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { lessons } = req.body;
  try {
    const subjects = await prisma.subject.findMany();
    const periods = await prisma.timePeriod.findMany({ orderBy: { order: 'asc' } });
    const courseId = lessons[0]?.courseId;
    const existingLessons = courseId ? await prisma.lesson.findMany({ where: { courseId } }) : [];
    
    const createdLessons = await prisma.$transaction(
      lessons.filter((l: any) => {
        const sStart = `${l.startDate}-${periods.findIndex((p: any) => p.id === l.startPeriodId).toString().padStart(3, '0')}`;
        const sEnd = `${l.endDate}-${periods.findIndex((p: any) => p.id === l.endPeriodId).toString().padStart(3, '0')}`;
        return !checkCollision(sStart, sEnd, existingLessons, periods as any);
      }).map((l: any) => {
        const subjectName = l.subjectId 
          ? subjects.find(s => s.id === l.subjectId)?.name || '' 
          : l.subject;

        return prisma.lesson.create({
          data: {
            course: { connect: { id: l.courseId } },
            subject: subjectName,
            subjectRef: l.subjectId ? { connect: { id: l.subjectId } } : undefined,
            startDate: l.startDate,
            endDate: l.endDate,
            startPeriodId: l.startPeriodId,
            endPeriodId: l.endPeriodId,
            teacher: l.teacherId ? { connect: { id: l.teacherId } } : undefined,
            subTeachers: l.subTeacherIds && l.subTeacherIds.length > 0 ? { connect: l.subTeacherIds.map((id: string) => ({ id })) } : undefined,
          }
        });
      })
    );
    res.json(createdLessons);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create lessons' });
  }
});

// Fetch delivery methods
app.get('/api/delivery-methods', verifyToken, async (req, res) => {
  try {
    const methods = await prisma.deliveryMethod.findMany({
      orderBy: { order: 'asc' }
    });
    res.json(methods);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch delivery methods' });
  }
});

// Bulk update/create delivery methods (ADMIN required)
app.post('/api/delivery-methods', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { methods } = req.body;
  try {
    await prisma.$transaction(async (tx) => {
      // Get existing ID list
      const existingMethods = await tx.deliveryMethod.findMany();
      const existingIds = existingMethods.map(m => m.id);
      const incomingIds = methods.filter((m: any) => m.id).map((m: any) => m.id);

      // Identify deleted items and remove
      const idsToDelete = existingIds.filter(id => !incomingIds.includes(id));
      if (idsToDelete.length > 0) {
        await tx.deliveryMethod.deleteMany({ where: { id: { in: idsToDelete } } });
      }

      // Update or create new
      for (let i = 0; i < methods.length; i++) {
        const m = methods[i];
        if (m.id) {
          await tx.deliveryMethod.update({
            where: { id: m.id },
            data: { name: m.name, color: m.color, order: i }
          });
        } else {
          await tx.deliveryMethod.create({
            data: { name: m.name, color: m.color, order: i }
          });
        }
      }
    });

    const updated = await prisma.deliveryMethod.findMany({
      orderBy: { order: 'asc' }
    });
    await createAuditLog(req, 'DeliveryMethod', 'BULK_UPDATE', updated);
    res.json(updated);
  } catch (error) {
    console.error('Failed to save delivery methods:', error);
    res.status(500).json({ error: 'Failed to save delivery methods' });
  }
});

// Delete lesson (ADMIN / Course Chief or Assistant Teacher)
app.delete('/api/lessons/:id', verifyToken, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { id } = req.params;
  try {
    const lesson = await prisma.lesson.findUnique({ 
      where: { id },
      include: { subTeachers: true, deliveryMethods: true }
    });
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    const hasPermission = await canManageCourseLessons(req.user.id, lesson.courseId);
    if (!hasPermission) return res.status(403).json({ error: 'Access denied.' });

    await prisma.lesson.delete({ where: { id } });
    await createAuditLog(req, 'Lesson', 'DELETE_LESSON', { old: lesson }, lesson.courseId, lesson.id);
    res.json({ message: 'Lesson deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete lesson' });
  }
});

// Fetch lesson history (ADMIN or TEACHER required)
app.get('/api/lessons/history', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN && req.user?.role !== UserRole.TEACHER) {
    return res.status(403).json({ error: 'Access denied. Admin or Teacher role required.' });
  }
  const { start, end, courseId, keyword, page = '1', limit = '50' } = req.query;
  const p = Math.max(1, parseInt(String(page)) || 1);
  const l = Math.max(1, parseInt(String(limit)) || 50);

  try {
    const andConditions: any[] = [{ tableName: 'Lesson' }];

    if (start) {
      const startDate = new Date(`${start}T00:00:00.000Z`);
      if (!isNaN(startDate.getTime())) {
        andConditions.push({ createdAt: { gte: startDate } });
      }
    }
    if (end) {
      const endDate = new Date(`${end}T23:59:59.999Z`);
      if (!isNaN(endDate.getTime())) {
        andConditions.push({ createdAt: { lte: endDate } });
      }
    }
    if (courseId && String(courseId).trim() !== '') {
      andConditions.push({ courseId: String(courseId) });
    }
    if (keyword && String(keyword).trim() !== '') {
      andConditions.push({ data: { contains: String(keyword), mode: 'insensitive' } });
    }

    const where = { AND: andConditions };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * l,
        take: l
      }),
      prisma.auditLog.count({ where })
    ]);

    res.json({
      logs,
      total,
      page: p,
      totalPages: Math.ceil(total / l)
    });
  } catch (error) {
    console.error('Failed to fetch lesson history:', error);
    res.status(500).json({ error: 'Failed to fetch lesson history', details: error instanceof Error ? error.message : String(error) });
  }
});

// Fetch lesson history (specific lesson)
app.get('/api/lessons/:id/history', verifyToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    const logs = await prisma.auditLog.findMany({
      where: {
        tableName: 'Lesson',
        lessonId: id
      },
      orderBy: { createdAt: 'asc' }
    });
    res.json(logs);
  } catch (error) {
    console.error('Failed to fetch lesson history:', error);
    res.status(500).json({ error: 'Failed to fetch lesson history' });
  }
});

// Fetch events (Auth required)
app.get('/api/events', verifyToken, async (req, res) => {
  try {
    const events = await prisma.scheduleEvent.findMany({
      include: {
        resources: {
          select: { id: true }
        }
      }
    });
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Export iCalendar (.ics)
app.get('/api/resources/:id/icalendar', verifyToken, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { id } = req.params;
  const { start, end } = req.query;

  try {
    const resource = await prisma.resource.findUnique({
      where: { id },
      include: { user: true }
    });

    if (!resource) return res.status(404).json({ error: 'Resource not found' });

    // Permission check: ADMIN or the linked user themselves
    if (req.user.role !== UserRole.ADMIN && resource.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Get lessons and events within range
    const whereClause: any = {};
    if (start && end) {
      whereClause.startDate = { gte: String(start) };
      whereClause.endDate = { lte: String(end) };
    }

    const [lessons, events, periods] = await Promise.all([
      prisma.lesson.findMany({
        where: { 
          ...whereClause,
          OR: [
            { teacherId: id },
            { subTeachers: { some: { id } } }
          ]
        },
        include: { course: true }
      }),
      prisma.scheduleEvent.findMany({
        where: {
          ...whereClause,
          resources: { some: { id } }
        }
      }),
      prisma.timePeriod.findMany({ orderBy: { order: 'asc' } })
    ]);

    // Generate ics file
    let ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//ScholaTile//NONSGML v1.0//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:ScholaTile Schedule',
      'X-WR-TIMEZONE:Asia/Tokyo'
    ];

    const formatICSDate = (dateStr: string, periodId: string, isEnd: boolean) => {
      const period = periods.find(p => p.id === periodId);
      const time = isEnd ? (period?.endTime || '23:59') : (period?.startTime || '00:00');
      // Combine YYYY-MM-DD and HH:mm into YYYYMMDDTHHmmSS format
      const d = dateStr.replace(/-/g, '');
      const t = time.replace(/:/g, '') + '00';
      return `${d}T${t}`;
    };

    // Add lessons
    lessons.forEach(l => {
      ics.push('BEGIN:VEVENT');
      ics.push(`UID:lesson-${l.id}@scholatile`);
      ics.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);
      ics.push(`DTSTART;TZID=Asia/Tokyo:${formatICSDate(l.startDate, l.startPeriodId, false)}`);
      ics.push(`DTEND;TZID=Asia/Tokyo:${formatICSDate(l.endDate, l.endPeriodId, true)}`);
      
      let summary = `${l.subject} (${l.course.name})`;
      if (l.externalTeacher) {
        summary += ` - ${l.externalTeacher}`;
      }
      ics.push(`SUMMARY:${summary}`);
      
      if (l.location) ics.push(`LOCATION:${l.location}`);
      
      let description = [];
      if (l.externalSubTeachers) description.push(`Sub Teachers (Ext): ${l.externalSubTeachers}`);
      if (l.remarks) description.push(`Remarks: ${l.remarks}`);
      if (description.length > 0) {
        ics.push(`DESCRIPTION:${description.join('\\n')}`);
      }
      
      ics.push('END:VEVENT');
    });

    // Add events
    events.forEach(e => {
      ics.push('BEGIN:VEVENT');
      ics.push(`UID:event-${e.id}@scholatile`);
      ics.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);
      ics.push(`DTSTART;TZID=Asia/Tokyo:${formatICSDate(e.startDate, e.startPeriodId, false)}`);
      ics.push(`DTEND;TZID=Asia/Tokyo:${formatICSDate(e.endDate, e.endPeriodId, true)}`);
      ics.push(`SUMMARY:${e.name}`);
      if (e.location) ics.push(`LOCATION:${e.location}`);
      if (e.remarks) ics.push(`DESCRIPTION:${e.remarks.replace(/\r?\n/g, '\\n')}`);
      ics.push('END:VEVENT');
    });

    ics.push('END:VCALENDAR');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="schedule-${id}.ics"`);
    res.send(ics.join('\r\n'));

  } catch (error) {
    console.error('Failed to export iCalendar:', error);
    res.status(500).json({ error: 'Failed to export iCalendar' });
  }
});

// Export CSV (Shift-JIS)
app.get('/api/resources/:id/csv', verifyToken, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { id } = req.params;
  const { start, end } = req.query;

  try {
    const resource = await prisma.resource.findUnique({
      where: { id },
      include: { user: true }
    });

    if (!resource) return res.status(404).json({ error: 'Resource not found' });

    // Permission check: ADMIN or the user themselves
    if (req.user.role !== UserRole.ADMIN && resource.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Get lessons and events within range
    const whereClause: any = {};
    if (start && end) {
      whereClause.startDate = { gte: String(start) };
      whereClause.endDate = { lte: String(end) };
    }

    const [lessons, events, periods] = await Promise.all([
      prisma.lesson.findMany({
        where: { 
          ...whereClause,
          OR: [
            { teacherId: id },
            { subTeachers: { some: { id } } }
          ]
        },
        include: { 
          course: true,
          room: true
        }
      }),
      prisma.scheduleEvent.findMany({
        where: {
          ...whereClause,
          resources: { some: { id } }
        }
      }),
      prisma.timePeriod.findMany({ orderBy: { order: 'asc' } })
    ]);

    const headers = [
      'ＩＤ（システムＩＤ：自動発番）', 
      '開始日', '開始時刻', '終了日', '終了時刻', 
      '予定', '予定詳細', '場所', '場所詳細', 
      '内容', '情報公開レベル', '外出区分', '重要度', '予約種別', 
      'フラグ', 'アイコン番号', '承認依頼', '確認通知メール', 
      '通知の方法：伝言', '所有者ID', '所有者名'
    ];

    const rows = [headers];

    const formatCSVDate = (dateStr: string) => dateStr.replace(/-/g, '/');
    const getStartTime = (periodId: string) => periods.find(p => p.id === periodId)?.startTime || '00:00';
    const getEndTime = (periodId: string) => periods.find(p => p.id === periodId)?.endTime || '23:59';

    // Combine and sort lessons and events
    const items = [
      ...lessons.map(l => {
        let location = l.location || '';
        if (l.room) {
          location = location ? `${l.room.name} (${location})` : l.room.name;
        }
        return {
          type: 'lesson',
          startDate: l.startDate,
          startPeriodId: l.startPeriodId,
          endDate: l.endDate,
          endPeriodId: l.endPeriodId,
          title: `${l.subject} (${l.course.name})${l.externalTeacher ? ` - ${l.externalTeacher}` : ''}`,
          location: location,
          remarks: l.remarks || ''
        };
      }),
      ...events.map(e => ({
        type: 'event',
        startDate: e.startDate,
        startPeriodId: e.startPeriodId,
        endDate: e.endDate,
        endPeriodId: e.endPeriodId,
        title: e.name,
        location: e.location || '',
        remarks: e.remarks || ''
      }))
    ];

    items.sort((a, b) => {
      if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
      const orderA = periods.find(p => p.id === a.startPeriodId)?.order || 0;
      const orderB = periods.find(p => p.id === b.startPeriodId)?.order || 0;
      return orderA - orderB;
    });

    items.forEach(item => {
      const row = Array(21).fill('');
      row[1] = formatCSVDate(item.startDate);
      row[2] = getStartTime(item.startPeriodId);
      row[3] = formatCSVDate(item.endDate);
      row[4] = getEndTime(item.endPeriodId);
      row[5] = item.type === 'lesson' ? '授業' : '行事';
      row[6] = item.title;
      row[7] = item.location;
      row[9] = item.remarks;
      rows.push(row);
    });

    // Generate CSV content
    const csvContent = rows.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const sjisBuffer = iconv.encode(csvContent, 'Shift_JIS');

    res.setHeader('Content-Type', 'text/csv; charset=shift_jis');
    res.setHeader('Content-Disposition', `attachment; filename="schedule-${id}.csv"`);
    res.send(sjisBuffer);

  } catch (error) {
    console.error('Failed to export CSV:', error);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

// Create/Update event (ADMIN/TEACHER required)
app.post('/api/events', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN && req.user?.role !== UserRole.TEACHER) {
    return res.status(403).json({ error: 'Access denied. Admin or Teacher role required.' });
  }
  const { id, name, startDate, startPeriodId, endDate, endPeriodId, color, location, remarks, showInEventRow, resourceIds } = req.body;
  try {
    const resourceConnect = resourceIds?.map((rid: string) => ({ id: rid })) || [];
    let event;

    if (id) {
      // Update
      event = await prisma.scheduleEvent.update({
        where: { id },
        data: {
          name,
          startDate,
          startPeriodId,
          endDate,
          endPeriodId,
          color,
          location: location || null,
          remarks: remarks || null,
          showInEventRow: showInEventRow ?? true,
          resources: {
            set: [], // Clear temporarily
            connect: resourceConnect
          }
        },
        include: { resources: true }
      });
      await createAuditLog(req, 'ScheduleEvent', 'UPDATE_EVENT', event);
    } else {
      // Create
      event = await prisma.scheduleEvent.create({
        data: {
          name,
          startDate,
          startPeriodId,
          endDate,
          endPeriodId,
          color,
          location: location || null,
          remarks: remarks || null,
          showInEventRow: showInEventRow ?? true,
          resources: {
            connect: resourceConnect
          }
        },
        include: { resources: true }
      });
      await createAuditLog(req, 'ScheduleEvent', 'CREATE_EVENT', event);
    }
    res.json(event);
  } catch (error) {
    console.error('Failed to save event:', error);
    res.status(500).json({ error: 'Failed to save event' });
  }
});

// Delete event (ADMIN/TEACHER required)
app.delete('/api/events/:id', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN && req.user?.role !== UserRole.TEACHER) {
    return res.status(403).json({ error: 'Access denied. Admin or Teacher role required.' });
  }
  const { id } = req.params;
  try {
    const event = await prisma.scheduleEvent.delete({
      where: { id }
    });
    await createAuditLog(req, 'ScheduleEvent', 'DELETE_EVENT', event);
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// Fetch holidays (Auth required)
app.get('/api/holidays', verifyToken, async (req, res) => {
  try {
    const holidays = await prisma.holiday.findMany();
    res.json(holidays);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch holidays' });
  }
});

// Create holiday (ADMIN only)
app.post('/api/holidays', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) return res.status(403).json({ error: 'Forbidden' });
  const { name, date, start, end } = req.body;
  try {
    const holiday = await prisma.holiday.create({
      data: { name, date, start, end }
    });
    await createAuditLog(req, 'Holiday', 'CREATE_HOLIDAY', holiday);
    res.json(holiday);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create holiday' });
  }
});

// Update holiday (ADMIN only)
app.put('/api/holidays/:id', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) return res.status(403).json({ error: 'Forbidden' });
  const { id } = req.params;
  const { name, date, start, end } = req.body;
  try {
    const holiday = await prisma.holiday.update({
      where: { id },
      data: { name, date, start, end }
    });
    await createAuditLog(req, 'Holiday', 'UPDATE_HOLIDAY', holiday);
    res.json(holiday);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update holiday' });
  }
});

// Delete holiday (ADMIN only)
app.delete('/api/holidays/:id', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) return res.status(403).json({ error: 'Forbidden' });
  const { id } = req.params;
  try {
    const holiday = await prisma.holiday.delete({ where: { id } });
    await createAuditLog(req, 'Holiday', 'DELETE_HOLIDAY', holiday);
    res.json({ message: 'Holiday deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete holiday' });
  }
});

// Import from Nager.Date (ADMIN only)
app.post('/api/holidays/import-nager', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) return res.status(403).json({ error: 'Forbidden' });
  const { year, countryCode } = req.body;
  try {
    const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`);
    if (!response.ok) throw new Error('Nager.Date API failed');
    const nagerHolidays: any[] = await response.json();
    
    const holidays = await Promise.all(nagerHolidays.map(nh => 
      prisma.holiday.create({
        data: {
          name: nh.localName || nh.name,
          date: nh.date
        }
      })
    ));
    await createAuditLog(req, 'Holiday', 'IMPORT_NAGER', { year, countryCode, count: holidays.length });
    res.json(holidays);
  } catch (error) {
    res.status(500).json({ error: 'Failed to import holidays from Nager.Date' });
  }
});

// Import from JSON file (ADMIN only)
app.post('/api/holidays/import-json', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) return res.status(403).json({ error: 'Forbidden' });
  const { holidays: nagerHolidays } = req.body;
  try {
    const holidays = await Promise.all(nagerHolidays.map((nh: any) => 
      prisma.holiday.create({
        data: {
          name: nh.localName || nh.name,
          date: nh.date
        }
      })
    ));
    await createAuditLog(req, 'Holiday', 'IMPORT_JSON', { count: holidays.length });
    res.json(holidays);
  } catch (error) {
    res.status(500).json({ error: 'Failed to import holidays from JSON' });
  }
});

// Fetch periods (Auth required)
app.get('/api/periods', verifyToken, async (req, res) => {
  try {
    const periods = await prisma.timePeriod.findMany({
      orderBy: { order: 'asc' }
    });
    res.json(periods);
  } catch (error) {
    console.error('Error fetching periods:', error);
    res.status(500).json({ error: 'Failed to fetch time periods' });
  }
});

// Update/Create periods (ADMIN required)
app.post('/api/periods', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { periods } = req.body;
  try {
    // Delete all existing periods and recreate (for simplification)
    await prisma.$transaction([
      prisma.timePeriod.deleteMany(),
      prisma.timePeriod.createMany({
        data: periods.map((p: any, idx: number) => ({
          id: `p${idx + 1}`,
          name: p.name,
          startTime: p.startTime,
          endTime: p.endTime,
          order: idx + 1
        }))
      })
    ]);
    const newPeriods = await prisma.timePeriod.findMany({
      orderBy: { order: 'asc' }
    });
    await createAuditLog(req, 'TimePeriod', 'BULK_UPDATE', newPeriods);
    res.json(newPeriods);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update time periods' });
  }
});

// Fetch resource labels (Auth required)
app.get('/api/labels', verifyToken, async (req, res) => {
  try {
    const label = await prisma.resourceLabel.findFirst();
    if (label) {
      if (!label.deliveryMethod) (label as any).deliveryMethod = "Delivery Method";
      if (!label.mainRoom) (label as any).mainRoom = "Main Room";
      if (!label.subject) (label as any).subject = "Subject";
      if (!label.courseType) (label as any).courseType = "Course Type";
      if (!label.subjectLarge) (label as any).subjectLarge = "Subject (Large)";
      if (!label.subjectMiddle) (label as any).subjectMiddle = "Subject (Middle)";
      if (!label.subjectSmall) (label as any).subjectSmall = "Subject (Small)";
      if (!label.equipment) (label as any).equipment = "Equipment";
      }    res.json(label);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch resource labels' });
  }
});

// Update resource labels (ADMIN required)
app.post('/api/labels', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { labels } = req.body;
  // Remove id if included (avoid Prisma update error)
  const { id, ...labelData } = labels;

  try {
    const existing = await prisma.resourceLabel.findFirst();
    let updated;
    if (existing) {
      updated = await prisma.resourceLabel.update({
        where: { id: existing.id },
        data: labelData
      });
    } else {
      updated = await prisma.resourceLabel.create({
        data: labelData
      });
    }
    await createAuditLog(req, 'ResourceLabel', 'UPDATE', updated);
    res.json(updated);
  } catch (error) {
    console.error('Failed to update resource labels:', error);
    res.status(500).json({ error: 'Failed to update resource labels' });
  }
});

// --- CourseType Endpoints ---

app.get('/api/course-types', verifyToken, async (req, res) => {
  const { name, startDate, endDate } = req.query;
  try {
    const where: any = {};
    if (name) {
      where.name = { contains: name as string, mode: 'insensitive' };
    }
    if (startDate) {
      where.startDate = { gte: startDate as string };
    }
    if (endDate) {
      where.endDate = { lte: endDate as string };
    }

    const types = await prisma.courseType.findMany({ 
      where,
      orderBy: { order: 'asc' } 
    });
    res.json(types);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch course types' });
  }
});

app.post('/api/course-types', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) return res.status(403).json({ error: 'Admin only' });
  const { id, name, order, startDate, endDate } = req.body;
  try {
    const data = { 
      name, 
      order: order || 0,
      startDate: startDate || null,
      endDate: endDate || null
    };
    const result = id 
      ? await prisma.courseType.update({ where: { id }, data })
      : await prisma.courseType.create({ data });
    await createAuditLog(req, 'CourseType', id ? 'UPDATE' : 'CREATE', result);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save course type' });
  }
});

app.post('/api/course-types/:id/duplicate', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) return res.status(403).json({ error: 'Admin only' });
  const { id } = req.params;
  try {
    const original = await prisma.courseType.findUnique({
      where: { id },
      include: { subjects: true }
    });
    if (!original) return res.status(404).json({ error: 'Course type not found' });

    const maxOrderType = await prisma.courseType.findFirst({
      orderBy: { order: 'desc' }
    });

    const newType = await prisma.courseType.create({
      data: {
        name: `${original.name} (Copy)`,
        order: (maxOrderType?.order || 0) + 1,
        startDate: original.startDate,
        endDate: original.endDate
      }
    });

    // Subject replication (maintain hierarchy)
    const oldToNewId = new Map<string, string>();
    
    // Replicate level by level
    for (let level = 1; level <= 3; level++) {
      const levelSubjects = original.subjects.filter(s => s.level === level);
      for (const s of levelSubjects) {
        const newSubject = await prisma.subject.create({
          data: {
            name: s.name,
            level: s.level,
            parentId: s.parentId ? oldToNewId.get(s.parentId) : null,
            courseTypeId: newType.id,
            totalPeriods: s.totalPeriods,
            order: s.order
          }
        });
        oldToNewId.set(s.id, newSubject.id);
      }
    }

    await createAuditLog(req, 'CourseType', 'DUPLICATE', { originalId: id, duplicatedId: newType.id });
    res.json(newType);
  } catch (error) {
    console.error('Failed to duplicate course type:', error);
    res.status(500).json({ error: 'Failed to duplicate course type' });
  }
});

app.delete('/api/course-types/:id', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) return res.status(403).json({ error: 'Admin only' });
  const { id } = req.params;
  try {
    const courseType = await prisma.courseType.delete({ where: { id } });
    await createAuditLog(req, 'CourseType', 'DELETE', courseType);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete course type' });
  }
});

app.post('/api/course-types/:id/reorder', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) return res.status(403).json({ error: 'Admin only' });
  const { orders } = req.body; // [{ id, order }, ...]
  try {
    await prisma.$transaction(
      orders.map((o: any) => prisma.courseType.update({ where: { id: o.id }, data: { order: o.order } }))
    );
    await createAuditLog(req, 'CourseType', 'REORDER', orders);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reorder course types' });
  }
});

app.post('/api/course-types/:id/import-subjects', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) return res.status(403).json({ error: 'Admin only' });
  const { id: courseTypeId } = req.params;
  const { rows } = req.body; // Array of { large, middle, small, totalPeriods, order }

  try {
    const courseType = await prisma.courseType.findUnique({ where: { id: courseTypeId } });
    if (!courseType) return res.status(404).json({ error: 'Course type not found' });

    await prisma.$transaction(async (tx) => {
      // 1. Delete existing subjects for this type
      await tx.subject.deleteMany({ where: { courseTypeId } });

      // 2. Process rows and build hierarchy
      let lastLarge: any = null;
      let lastMiddle: any = null;

      let currentLargeName = '';
      let currentMiddleName = '';

      let largeOrder = 0;
      let middleOrder = 0;
      let smallOrder = 0;

      for (const row of rows) {
        const largeName = row.large || currentLargeName;
        const middleName = row.middle || (row.large ? '' : currentMiddleName);
        const smallName = row.small;

        // Determine actual level of this row
        let level = 1;
        if (row.small) level = 3;
        else if (row.middle || (middleName && !row.large)) level = 2;
        else if (row.large || largeName) level = 1;

        if (level === 1) {
          if (largeName !== currentLargeName) {
            largeOrder++;
            middleOrder = 0;
            smallOrder = 0;
          }
          lastLarge = await tx.subject.create({
            data: {
              name: largeName,
              level: 1,
              courseTypeId,
              order: largeOrder,
              totalPeriods: row.totalPeriods || null
            }
          });
          currentLargeName = largeName;
          lastMiddle = null;
          currentMiddleName = '';
        } else if (level === 2) {
          if (largeName !== currentLargeName) {
            largeOrder++;
            lastLarge = await tx.subject.create({
              data: { name: largeName, level: 1, courseTypeId, order: largeOrder }
            });
            currentLargeName = largeName;
            middleOrder = 0;
            smallOrder = 0;
          }
          if (middleName !== currentMiddleName) {
            middleOrder++;
            smallOrder = 0;
          }
          lastMiddle = await tx.subject.create({
            data: {
              name: middleName,
              level: 2,
              parentId: lastLarge.id,
              courseTypeId,
              order: middleOrder,
              totalPeriods: row.totalPeriods || null
            }
          });
          currentMiddleName = middleName;
        } else if (level === 3) {
          if (!lastLarge || currentLargeName !== largeName) {
            largeOrder++;
            lastLarge = await tx.subject.create({
              data: { name: largeName, level: 1, courseTypeId, order: largeOrder }
            });
            currentLargeName = largeName;
            middleOrder = 0;
            smallOrder = 0;
          }
          if (!lastMiddle || currentMiddleName !== middleName) {
            middleOrder++;
            lastMiddle = await tx.subject.create({
              data: { name: middleName, level: 2, parentId: lastLarge.id, courseTypeId, order: middleOrder }
            });
            currentMiddleName = middleName;
            smallOrder = 0;
          }
          smallOrder++;
          await tx.subject.create({
            data: {
              name: smallName,
              level: 3,
              parentId: lastMiddle.id,
              courseTypeId,
              order: smallOrder,
              totalPeriods: row.totalPeriods || null
            }
          });
        }
      }
    });

    res.json({ success: true });
    await createAuditLog(req, 'Subject', 'IMPORT', { courseTypeId, rowCount: rows.length });
  } catch (error) {
    console.error('Failed to import subjects:', error);
    res.status(500).json({ error: 'Failed to import subjects' });
  }
});

// --- Subject Endpoints ---

app.get('/api/subjects', verifyToken, async (req, res) => {
  try {
    const subjects = await prisma.subject.findMany({ 
      include: { children: true },
      orderBy: { order: 'asc' } 
    });
    res.json(subjects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch subjects' });
  }
});

app.post('/api/subjects', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) return res.status(403).json({ error: 'Admin only' });
  const { id, name, level, parentId, courseTypeId, totalPeriods, order } = req.body;
  try {
    const data = { name, level, parentId, courseTypeId, totalPeriods, order: order || 0 };
    const result = id 
      ? await prisma.subject.update({ where: { id }, data })
      : await prisma.subject.create({ data });
    res.json(result);
    await createAuditLog(req, 'Subject', id ? 'UPDATE' : 'CREATE', result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save subject' });
  }
});

app.delete('/api/subjects/:id', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) return res.status(403).json({ error: 'Admin only' });
  const { id } = req.params;
  try {
    await prisma.subject.delete({ where: { id } });
    res.json({ success: true });
    await createAuditLog(req, 'Subject', 'DELETE', { id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete subject' });
  }
});

app.post('/api/subjects/reorder', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) return res.status(403).json({ error: 'Admin only' });
  const { orders } = req.body;
  try {
    await prisma.$transaction(
      orders.map((o: any) => prisma.subject.update({ where: { id: o.id }, data: { order: o.order } }))
    );
    res.json({ success: true });
    await createAuditLog(req, 'Subject', 'REORDER', { count: orders.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reorder subjects' });
  }
});

// Fetch color themes (Auth required)
app.get('/api/color-themes', verifyToken, async (req, res) => {
  try {
    const themes = await prisma.colorTheme.findMany({
      orderBy: [
        { category: 'asc' },
        { order: 'asc' }
      ]
    });
    res.json(themes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch color themes' });
  }
});

// Bulk update/create color themes (ADMIN required)
app.post('/api/color-themes', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { themes } = req.body;
  try {
    const results = await prisma.$transaction(
      themes.map((t: any) => {
        const { id, ...data } = t;
        if (id && !id.startsWith('temp-')) {
          return prisma.colorTheme.update({
            where: { id },
            data
          });
        } else {
          return prisma.colorTheme.create({
            data
          });
        }
      })
    );
    res.json(results);
    await createAuditLog(req, 'ColorTheme', 'BULK_UPDATE', { count: themes.length });
  } catch (error) {
    console.error('Failed to update color themes:', error);
    res.status(500).json({ error: 'Failed to update color themes' });
  }
});

// Delete color theme (ADMIN required)
app.delete('/api/color-themes/:id', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { id } = req.params;
  try {
    await prisma.colorTheme.delete({
      where: { id }
    });
    res.json({ message: 'Color theme deleted successfully' });
    await createAuditLog(req, 'ColorTheme', 'DELETE', { id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete color theme' });
  }
});

// --- SavedFilter Endpoints ---

app.get('/api/saved-filters', verifyToken, async (req, res) => {
  try {
    if (!(prisma as any).savedFilter) {
      throw new Error('Prisma model "savedFilter" is not defined. Please restart the server or regenerate Prisma client.');
    }
    const filters = await prisma.savedFilter.findMany({
      orderBy: { order: 'asc' }
    });
    res.json(filters);
  } catch (error: any) {
    console.error('Failed to fetch saved filters:', error);
    res.status(500).json({ error: 'Failed to fetch saved filters', details: error.message });
  }
});

app.post('/api/saved-filters', verifyToken, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { id, name, resourceType, resourceIds, order } = req.body;
  try {
    const data = {
      name,
      resourceType,
      resourceIds,
      order: order || 0
    };
    const result = id
      ? await prisma.savedFilter.update({ where: { id }, data })
      : await prisma.savedFilter.create({ data });
    res.json(result);
    await createAuditLog(req, 'SavedFilter', id ? 'UPDATE' : 'CREATE', result);
  } catch (error: any) {
    console.error('Failed to save filter:', error);
    res.status(500).json({ error: 'Failed to save filter', details: error.message });
  }
});

app.delete('/api/saved-filters/:id', verifyToken, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { id } = req.params;
  try {
    await prisma.savedFilter.delete({ where: { id } });
    res.json({ success: true });
    await createAuditLog(req, 'SavedFilter', 'DELETE', { id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete saved filter' });
  }
});

// --- AuditLog Endpoints ---

app.get('/api/audit-logs', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { date, user: userQuery, table, action, page = '1', limit = '100' } = req.query;
  const p = Math.max(1, parseInt(String(page)));
  const l = Math.max(1, parseInt(String(limit)));

  try {
    const where: any = {};
    if (date) {
      where.createdAt = {
        gte: new Date(`${date}T00:00:00.000Z`),
        lte: new Date(`${date}T23:59:59.999Z`)
      };
    }
    if (userQuery) {
      where.userEmail = { contains: String(userQuery), mode: 'insensitive' };
    }
    if (table) {
      where.tableName = { contains: String(table), mode: 'insensitive' };
    }
    if (action) {
      where.action = String(action);
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * l,
        take: l
      }),
      prisma.auditLog.count({ where })
    ]);

    res.json({
      logs,
      total,
      page: p,
      totalPages: Math.ceil(total / l)
    });
  } catch (error) {
    console.error('Failed to fetch audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// --- Equipment Endpoints ---

// Fetch equipment (Auth required)
app.get('/api/equipments', verifyToken, async (req, res) => {
  try {
    const equipments = await prisma.equipment.findMany({
      orderBy: { order: 'asc' }
    });
    res.json(equipments);
  } catch (error) {
    console.error('Failed to fetch equipments:', error);
    res.status(500).json({ error: 'Failed to fetch equipments' });
  }
});

// Create/Update equipment (ADMIN or EQUIPMENT_MANAGER required)
app.post('/api/equipments', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN && req.user?.role !== UserRole.EQUIPMENT_MANAGER) {
    return res.status(403).json({ error: 'Access denied. Admin or Equipment Manager role required.' });
  }
  const { id, name, remarks, order } = req.body;
  try {
    let equipment;
    if (id) {
      equipment = await prisma.equipment.update({
        where: { id },
        data: { name, remarks, order: order || 0 }
      });
      await createAuditLog(req, 'Equipment', 'UPDATE', equipment);
    } else {
      equipment = await prisma.equipment.create({
        data: { name, remarks, order: order || 0 }
      });
      await createAuditLog(req, 'Equipment', 'CREATE', equipment);
    }
    res.json(equipment);
  } catch (error) {
    console.error('Failed to save equipment:', error);
    res.status(500).json({ error: 'Failed to save equipment' });
  }
});

// Reorder equipment (ADMIN or EQUIPMENT_MANAGER required)
app.post('/api/equipments/reorder', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN && req.user?.role !== UserRole.EQUIPMENT_MANAGER) {
    return res.status(403).json({ error: 'Access denied. Admin or Equipment Manager role required.' });
  }
  const { orders } = req.body; // Array of { id: string, order: number }
  try {
    await prisma.$transaction(
      orders.map((item: { id: string, order: number }) =>
        prisma.equipment.update({
          where: { id: item.id },
          data: { order: item.order }
        })
      )
    );
    await createAuditLog(req, 'Equipment', 'REORDER', orders);
    res.json({ message: 'Equipment order updated successfully' });
  } catch (error) {
    console.error('Failed to update equipment order:', error);
    res.status(500).json({ error: 'Failed to update equipment order' });
  }
});

// Delete equipment (ADMIN or EQUIPMENT_MANAGER required)
app.delete('/api/equipments/:id', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN && req.user?.role !== UserRole.EQUIPMENT_MANAGER) {
    return res.status(403).json({ error: 'Access denied. Admin or Equipment Manager role required.' });
  }
  const { id } = req.params;
  try {
    const equipment = await prisma.equipment.delete({
      where: { id }
    });
    await createAuditLog(req, 'Equipment', 'DELETE', equipment);
    res.json({ message: 'Equipment deleted successfully' });
  } catch (error) {
    console.error('Failed to delete equipment:', error);
    res.status(500).json({ error: 'Failed to delete equipment' });
  }
});

app.listen(Number(port), host, () => {
  console.log(`Backend server is running on http://${host}:${port}`);
});
