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
import { verifyToken, AuthRequest } from './authMiddleware';

const app = express();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const port = process.env.PORT || 3001;
const host = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

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

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    
    // Save to Cookie
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // または 'strict'
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.json({
      user: { id: user.id, email: user.email, role: user.role, resourceId: user.resource?.id }
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
      resourceId: user.resource?.id
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
        courseType: true
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
    } else {
      // Create
      const hashedPassword = await bcrypt.hash(password, 10);
      user = await prisma.user.create({
        data: { email, password: hashedPassword, role },
        select: { id: true, email: true, role: true }
      });
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
    await prisma.user.delete({ where: { id } });
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
    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword }
    });
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
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update system settings (ADMIN required)
app.post('/api/settings', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { allowPublicSignup, yearViewStartMonth, yearViewStartDay, weekendDays, holidayTheme } = req.body;
  try {
    let settings = await prisma.systemSetting.findFirst();
    const data = {
      allowPublicSignup,
      yearViewStartMonth: parseInt(yearViewStartMonth) || 4,
      yearViewStartDay: parseInt(yearViewStartDay) || 1,
      weekendDays: weekendDays || "0,6",
      holidayTheme: holidayTheme || "default"
    };

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
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// Create/Update room (ADMIN required)
app.post('/api/rooms', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { id, name, order } = req.body;
  try {
    let room;
    if (id) {
      room = await prisma.resource.update({
        where: { id },
        data: {
          name,
          order: order || 0
        }
      });
    } else {
      room = await prisma.resource.create({
        data: {
          name,
          type: ResourceType.room,
          order: order || 0
        }
      });
    }
    res.json(room);
  } catch (error) {
    console.error('Failed to save room:', error);
    res.status(500).json({ error: 'Failed to save room' });
  }
});

// Update room order (ADMIN required)
app.post('/api/rooms/reorder', verifyToken, async (req: AuthRequest, res) => {
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
    res.json({ message: 'Order updated successfully' });
  } catch (error) {
    console.error('Failed to update room order:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// Delete room (ADMIN required)
app.delete('/api/rooms/:id', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { id } = req.params;
  try {
    await prisma.resource.delete({
      where: { id }
    });
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
    } else {
      teacher = await prisma.resource.create({
        data: {
          name,
          type: ResourceType.teacher,
          order: order || 0,
          userId: userId || null
        }
      });
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
    await prisma.resource.delete({
      where: { id }
    });
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
    await prisma.resource.delete({
      where: { id }
    });
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
    const getAbsTime = (date: string, pId: string) => {
      const pIdx = periods.findIndex(p => p.id === pId);
      return `${date}-${pIdx.toString().padStart(3, '0')}`;
    };

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
      const sStart = getAbsTime(sL.startDate, sL.startPeriodId);
      const sEnd = getAbsTime(sL.endDate, sL.endPeriodId);

      // Duplication check
      const isOverlapping = existingLessons.some(eL => {
        const eStart = getAbsTime(eL.startDate, eL.startPeriodId);
        const eEnd = getAbsTime(eL.endDate, eL.endPeriodId);
        return sStart <= eEnd && eStart <= sEnd;
      });

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

    res.json({ message: `Successfully duplicated ${count} lessons.`, count });
  } catch (error) {
    console.error('Failed to duplicate lessons:', error);
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
      // Create時: 指定された講座に対して権限があるか
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

      const lesson = await prisma.lesson.update({
        where: { id },
        data,
        include: { subTeachers: true, deliveryMethods: true }
      });
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
      res.json(lesson);
    }
  } catch (error) {
    console.error('Failed to save lesson:', error);
    res.status(500).json({ error: 'Failed to save lesson' });
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

      // Updateまたは新規作成
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
    const lesson = await prisma.lesson.findUnique({ where: { id } });
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    const hasPermission = await canManageCourseLessons(req.user.id, lesson.courseId);
    if (!hasPermission) return res.status(403).json({ error: 'Access denied.' });

    await prisma.lesson.delete({ where: { id } });
    res.json({ message: 'Lesson deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete lesson' });
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

    // Permission check: ADMIN または 紐付けられたユーザー本人
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
    await prisma.scheduleEvent.delete({
      where: { id }
    });
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
    await prisma.holiday.delete({ where: { id } });
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
    }
    res.json(label);
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

    // Subject 複製 (階層維持)
    const oldToNewId = new Map<string, string>();
    
    // Levelごとに複製
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

    res.json(newType);
  } catch (error) {
    console.error('Failed to duplicate course type:', error);
    res.status(500).json({ error: 'Failed to duplicate course type' });
  }
});

app.delete('/api/course-types/:id', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) return res.status(403).json({ error: 'Admin only' });
  try {
    await prisma.courseType.delete({ where: { id: req.params.id } });
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
  } catch (error) {
    res.status(500).json({ error: 'Failed to save subject' });
  }
});

app.delete('/api/subjects/:id', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) return res.status(403).json({ error: 'Admin only' });
  try {
    await prisma.subject.delete({ where: { id: req.params.id } });
    res.json({ success: true });
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
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete color theme' });
  }
});

app.listen(Number(port), host, () => {
  console.log(`Backend server is running on http://${host}:${port}`);
});
