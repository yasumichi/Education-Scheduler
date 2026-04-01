import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
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
  origin: FRONTEND_URL
}));
app.use(express.json());

// --- Authentication Routes ---

// ユーザー登録
app.post('/api/auth/register', async (req, res) => {
  const { email, password, role } = req.body;
  try {
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

// ログイン
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// --- Protected Routes ---

// 基本的なヘルスチェック
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'EduGrid Scheduler Backend is running' });
});

// リソース一覧取得 (認証必須)
app.get('/api/resources', verifyToken, async (req, res) => {
  try {
    const resources = await prisma.resource.findMany({
      include: {
        subjects: true,
        defaultSubTeachers: { select: { id: true } }
      },
      orderBy: { order: 'asc' }
    });
    res.json(resources);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch resources' });
  }
});

// 教室の作成・更新 (ADMIN権限)
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

// 教室の削除 (ADMIN権限)
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

// 講座の作成・更新 (ADMIN権限)
app.post('/api/courses', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { id, name, order, startDate, endDate, subjects, mainRoomId, defaultTeacherId, defaultSubTeacherIds, mainTeacherLabel, subTeacherLabel } = req.body;
  try {
    let course;
    const commonData = {
      name,
      order: order || 0,
      startDate,
      endDate,
      mainRoomId: mainRoomId || null,
      defaultTeacherId: defaultTeacherId || null,
      mainTeacherLabel: mainTeacherLabel || null,
      subTeacherLabel: subTeacherLabel || null,
      subjects: {
        deleteMany: {},
        create: subjects.map((s: any) => ({
          name: s.name,
          totalPeriods: s.totalPeriods
        }))
      }
    };

    const subTeachersConnect = defaultSubTeacherIds?.map((tid: string) => ({ id: tid })) || [];

    if (id) {
      // 更新
      course = await prisma.resource.update({
        where: { id },
        data: {
          ...commonData,
          defaultSubTeachers: {
            set: [],
            connect: subTeachersConnect
          }
        },
        include: { subjects: true, defaultSubTeachers: true }
      });
    } else {
      // 新規作成
      course = await prisma.resource.create({
        data: {
          ...commonData,
          type: ResourceType.course,
          defaultSubTeachers: {
            connect: subTeachersConnect
          }
        },
        include: { subjects: true, defaultSubTeachers: true }
      });
    }
    res.json(course);
  } catch (error) {
    console.error('Failed to save course:', error);
    res.status(500).json({ error: 'Failed to save course' });
  }
});

// 講座の削除 (ADMIN権限)
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

// 授業一覧取得 (認証必須)
app.get('/api/lessons', verifyToken, async (req, res) => {
  try {
    const lessons = await prisma.lesson.findMany({
      include: {
        subTeachers: {
          select: { id: true }
        }
      }
    });
    res.json(lessons);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
});

// 授業の作成・更新 (ADMIN権限)
app.post('/api/lessons', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { id, subject, teacherId, subTeacherIds, roomId, courseId, location, startDate, startPeriodId, endDate, endPeriodId } = req.body;
  try {
    const subTeachersConnect = subTeacherIds?.map((tid: string) => ({ id: tid })) || [];
    
    // 共通のデータ
    const commonData = {
      subject,
      location: location || null,
      startDate,
      startPeriodId,
      endDate,
      endPeriodId,
    };

    if (id) {
      // 更新 (Update)
      const data: any = {
        ...commonData,
        course: { connect: { id: courseId } },
        subTeachers: {
          set: [],
          connect: subTeachersConnect
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
        include: { subTeachers: true }
      });
      res.json(lesson);
    } else {
      // 新規作成 (Create)
      const data: any = {
        ...commonData,
        course: { connect: { id: courseId } },
        subTeachers: {
          connect: subTeachersConnect
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
        include: { subTeachers: true }
      });
      res.json(lesson);
    }
  } catch (error) {
    console.error('Failed to save lesson:', error);
    res.status(500).json({ error: 'Failed to save lesson' });
  }
});

// 授業の削除 (ADMIN権限)
app.delete('/api/lessons/:id', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { id } = req.params;
  try {
    await prisma.lesson.delete({ where: { id } });
    res.json({ message: 'Lesson deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete lesson' });
  }
});

// イベント一覧取得 (認証必須)
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

// 行事の作成・更新 (ADMIN権限)
app.post('/api/events', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { id, name, startDate, startPeriodId, endDate, endPeriodId, color, showInEventRow, resourceIds } = req.body;
  try {
    const resourceConnect = resourceIds?.map((rid: string) => ({ id: rid })) || [];
    let event;

    if (id) {
      // 更新
      event = await prisma.scheduleEvent.update({
        where: { id },
        data: {
          name,
          startDate,
          startPeriodId,
          endDate,
          endPeriodId,
          color,
          showInEventRow: showInEventRow ?? true,
          resources: {
            set: [], // 一旦クリア
            connect: resourceConnect
          }
        },
        include: { resources: true }
      });
    } else {
      // 新規作成
      event = await prisma.scheduleEvent.create({
        data: {
          name,
          startDate,
          startPeriodId,
          endDate,
          endPeriodId,
          color,
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

// 行事の削除 (ADMIN権限)
app.delete('/api/events/:id', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
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

// 祝日一覧取得 (認証必須)
app.get('/api/holidays', verifyToken, async (req, res) => {
  try {
    const holidays = await prisma.holiday.findMany();
    res.json(holidays);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch holidays' });
  }
});

// 時限一覧取得 (認証必須)
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

// 時限の更新/作成 (ADMIN権限)
app.post('/api/periods', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { periods } = req.body;
  try {
    // 既存の時限を全削除して再作成（単純化のため）
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

// リソースラベル取得 (認証必須)
app.get('/api/labels', verifyToken, async (req, res) => {
  try {
    const label = await prisma.resourceLabel.findFirst();
    res.json(label);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch resource labels' });
  }
});

// リソースラベル更新 (ADMIN権限)
app.post('/api/labels', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { labels } = req.body;
  try {
    const existing = await prisma.resourceLabel.findFirst();
    let updated;
    if (existing) {
      updated = await prisma.resourceLabel.update({
        where: { id: existing.id },
        data: labels
      });
    } else {
      updated = await prisma.resourceLabel.create({
        data: labels
      });
    }
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update resource labels' });
  }
});

app.listen(Number(port), host, () => {
  console.log(`Backend server is running on http://${host}:${port}`);
});
