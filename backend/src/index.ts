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

// ユーザー登録
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

// パスワード変更 (自分自身)
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

// ログイン
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
    
    // Cookie に保存
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax', // または 'strict'
      maxAge: 24 * 60 * 60 * 1000 // 24時間
    });

    res.json({
      user: { id: user.id, email: user.email, role: user.role, resourceId: user.resource?.id }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// ログアウト
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ message: 'Logged out successfully' });
});

// セッション確認 (自分自身の情報取得)
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

// 基本的なヘルスチェック
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'ScholaTile Backend is running' });
});

// リソース一覧取得 (認証必須)
app.get('/api/resources', verifyToken, async (req, res) => {
  try {
    const resources = await prisma.resource.findMany({
      include: {
        subjects: true,
        assistantTeachers: { select: { id: true } }
      },
      orderBy: { order: 'asc' }
    });
    res.json(resources);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch resources' });
  }
});

// ユーザー一覧取得 (ADMIN権限)
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

// ユーザー作成・更新 (ADMIN権限)
app.post('/api/users', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { id, email, password, role } = req.body;
  try {
    let user;
    if (id) {
      // 更新
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
      // 新規作成
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

// ユーザー削除 (ADMIN権限)
app.delete('/api/users/:id', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { id } = req.params;
  try {
    // 自分自身は削除できないようにする
    if (req.user.id === id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }
    await prisma.user.delete({ where: { id } });
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// 管理者によるパスワードリセット (ADMIN権限)
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

// システム設定取得
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

// システム設定更新 (ADMIN権限)
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

// 教室の順序更新 (ADMIN権限)
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

// 講師の作成・更新 (ADMIN権限)
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

// 講師の順序更新 (ADMIN権限)
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

// 講師の削除 (ADMIN権限)
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

// 講座の作成・更新 (ADMIN権限)
app.post('/api/courses', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { id, name, order, startDate, endDate, subjects, mainRoomId, chiefTeacherId, assistantTeacherIds, mainTeacherLabel, subTeacherLabel } = req.body;
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
    };

    const subTeachersConnect = assistantTeacherIds?.map((tid: string) => ({ id: tid })) || [];

    if (id) {
      // 更新
      course = await prisma.resource.update({
        where: { id },
        data: {
          ...commonData,
          subjects: {
            deleteMany: {},
            create: subjects.map((s: any) => ({
              name: s.name,
              totalPeriods: s.totalPeriods
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
      // 新規作成
      course = await prisma.resource.create({
        data: {
          ...commonData,
          subjects: {
            create: subjects.map((s: any) => ({
              name: s.name,
              totalPeriods: s.totalPeriods
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

// 講座の順序更新 (ADMIN権限)
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

// 講座の複製 (ADMIN権限)
app.post('/api/courses/:id/duplicate', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { id } = req.params;
  try {
    // 元の講座を取得 (関連する課目、サブ講師も含む)
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

    // 新しい講座の作成 (トランザクションを使用)
    const duplicated = await prisma.$transaction(async (tx) => {
      // 1. 講座リソースを新規作成
      const newCourse = await tx.resource.create({
        data: {
          name: `(Copy) ${original.name}`,
          type: ResourceType.course,
          order: (original.order || 0) + 1, // 元の講座の次の位置に配置
          startDate: original.startDate,
          endDate: original.endDate,
          mainRoomId: original.mainRoomId,
          chiefTeacherId: original.chiefTeacherId,
          mainTeacherLabel: original.mainTeacherLabel,
          subTeacherLabel: original.subTeacherLabel,
          assistantTeachers: {
            connect: original.assistantTeachers.map(t => ({ id: t.id }))
          }
        }
      });

      // 2. 課目を複製
      if (original.subjects.length > 0) {
        await tx.courseSubject.createMany({
          data: original.subjects.map(s => ({
            name: s.name,
            totalPeriods: s.totalPeriods,
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

// 講座間での授業複製 (ADMIN / Course Chief or Assistant Teacher)
app.post('/api/courses/:id/duplicate-lessons', verifyToken, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { id: destinationCourseId } = req.params;
  const { sourceCourseId, startDate, endDate } = req.body;

  try {
    // 権限チェック (複製先の講座に対して)
    const hasPermission = await canManageCourseLessons(req.user.id, destinationCourseId);
    if (!hasPermission) return res.status(403).json({ error: 'Access denied to destination course.' });

    // 複製先の講座情報を取得
    const destinationCourse = await prisma.resource.findUnique({
      where: { id: destinationCourseId }
    });
    if (!destinationCourse || destinationCourse.type !== ResourceType.course) {
      return res.status(404).json({ error: 'Destination course not found.' });
    }

    // 日付範囲バリデーション
    if (destinationCourse.startDate && startDate < destinationCourse.startDate) {
      return res.status(400).json({ error: `Start date cannot be before ${destinationCourse.startDate}` });
    }
    if (destinationCourse.endDate && endDate > destinationCourse.endDate) {
      return res.status(400).json({ error: `End date cannot be after ${destinationCourse.endDate}` });
    }

    // 全ての時限を取得 (絶対時間計算用)
    const periods = await prisma.timePeriod.findMany({ orderBy: { order: 'asc' } });
    const getAbsTime = (date: string, pId: string) => {
      const pIdx = periods.findIndex(p => p.id === pId);
      return `${date}-${pIdx.toString().padStart(3, '0')}`;
    };

    // 複製元の授業を取得
    const sourceLessons = await prisma.lesson.findMany({
      where: {
        courseId: sourceCourseId,
        startDate: { gte: startDate },
        endDate: { lte: endDate }
      },
      include: { deliveryMethods: { select: { id: true } } }
    });

    // 複製先の既存の授業を取得 (重複チェック用)
    const existingLessons = await prisma.lesson.findMany({
      where: { courseId: destinationCourseId }
    });

    let count = 0;
    for (const sL of sourceLessons) {
      const sStart = getAbsTime(sL.startDate, sL.startPeriodId);
      const sEnd = getAbsTime(sL.endDate, sL.endPeriodId);

      // 重複チェック
      const isOverlapping = existingLessons.some(eL => {
        const eStart = getAbsTime(eL.startDate, eL.startPeriodId);
        const eEnd = getAbsTime(eL.endDate, eL.endPeriodId);
        return sStart <= eEnd && eStart <= sEnd;
      });

      if (!isOverlapping) {
        await prisma.lesson.create({
          data: {
            subject: sL.subject,
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

// 授業一覧取得 (認証必須)
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

// 授業の作成・更新 (ADMIN / Course Chief or Assistant Teacher)
app.post('/api/lessons', verifyToken, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  
  const { id, subject, teacherId, subTeacherIds, roomId, courseId, location, startDate, startPeriodId, endDate, endPeriodId, deliveryMethodIds, remarks, externalTeacher, externalSubTeachers } = req.body;

  try {
    // 権限チェック
    if (id) {
      // 更新時: 現在の授業の講座に対して権限があるか
      const currentLesson = await prisma.lesson.findUnique({ 
        where: { id },
        include: { subTeachers: { select: { id: true } } }
      });
      if (!currentLesson) return res.status(404).json({ error: 'Lesson not found' });
      
      const hasPermissionToCurrent = await canManageCourseLessons(req.user.id, currentLesson.courseId);
      
      // 追加: 授業の担当講師（メインまたはサブ）であれば、授業方式と備考のみ変更可能とするためのフラグ
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

      // 講座が変更される場合、変更先への権限もチェック
      if (courseId && courseId !== currentLesson.courseId) {
        if (onlyDeliveryMethodAndRemarksAllowed) {
           return res.status(403).json({ error: 'Access denied. You can only change delivery methods and remarks for this lesson.' });
        }
        const hasPermissionToNew = await canManageCourseLessons(req.user.id, courseId);
        if (!hasPermissionToNew) return res.status(403).json({ error: 'Access denied to new course.' });
      }

      // 権限が「授業方式と備考のみ」の場合、他のフィールドが変更されていないかチェック
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
          // remarks は許可されているので除外
          externalTeacher !== currentLesson.externalTeacher ||
          externalSubTeachers !== currentLesson.externalSubTeachers ||
          // サブ講師の変更チェック (簡易的)
          (subTeacherIds && (
            subTeacherIds.length !== currentLesson.subTeachers.length ||
            !subTeacherIds.every((id: string) => currentLesson.subTeachers.some(t => t.id === id))
          ));
        
        if (isOtherFieldChanged) {
          return res.status(403).json({ error: 'Access denied. You can only change delivery methods and remarks for this lesson.' });
        }
      }
    } else {
      // 新規作成時: 指定された講座に対して権限があるか
      if (!courseId) return res.status(400).json({ error: 'courseId is required' });
      const hasPermission = await canManageCourseLessons(req.user.id, courseId);
      if (!hasPermission) return res.status(403).json({ error: 'Access denied.' });
    }

    const subTeachersConnect = subTeacherIds?.map((tid: string) => ({ id: tid })) || [];
    const deliveryMethodsConnect = deliveryMethodIds?.map((did: string) => ({ id: did })) || [];
    
    // 共通のデータ
    const commonData = {
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

    if (id) {
      // 更新 (Update)
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
      // 新規作成 (Create)
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

// 授業方式一覧取得
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

// 授業方式の一括更新/作成 (ADMIN権限)
app.post('/api/delivery-methods', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Access denied. Admin role required.' });
  }
  const { methods } = req.body;
  try {
    await prisma.$transaction(async (tx) => {
      // 既存のIDリストを取得
      const existingMethods = await tx.deliveryMethod.findMany();
      const existingIds = existingMethods.map(m => m.id);
      const incomingIds = methods.filter((m: any) => m.id).map((m: any) => m.id);

      // 削除されたものを特定して削除
      const idsToDelete = existingIds.filter(id => !incomingIds.includes(id));
      if (idsToDelete.length > 0) {
        await tx.deliveryMethod.deleteMany({ where: { id: { in: idsToDelete } } });
      }

      // 更新または新規作成
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

// 授業の削除 (ADMIN / Course Chief or Assistant Teacher)
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

// iCalendar (.ics) エクスポート
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

    // 権限チェック: ADMIN または 紐付けられたユーザー本人
    if (req.user.role !== UserRole.ADMIN && resource.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // 期間内の授業とイベントを取得
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

    // ics ファイルの生成
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
      // YYYY-MM-DD と HH:mm を結合して YYYYMMDDTHHmmSS 形式にする
      const d = dateStr.replace(/-/g, '');
      const t = time.replace(/:/g, '') + '00';
      return `${d}T${t}`;
    };

    // 授業の追加
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

    // イベントの追加
    events.forEach(e => {
      ics.push('BEGIN:VEVENT');
      ics.push(`UID:event-${e.id}@scholatile`);
      ics.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);
      ics.push(`DTSTART;TZID=Asia/Tokyo:${formatICSDate(e.startDate, e.startPeriodId, false)}`);
      ics.push(`DTEND;TZID=Asia/Tokyo:${formatICSDate(e.endDate, e.endPeriodId, true)}`);
      ics.push(`SUMMARY:${e.name}`);
      if (e.location) ics.push(`LOCATION:${e.location}`);
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

// 行事の作成・更新 (ADMIN/TEACHER権限)
app.post('/api/events', verifyToken, async (req: AuthRequest, res) => {
  if (req.user?.role !== UserRole.ADMIN && req.user?.role !== UserRole.TEACHER) {
    return res.status(403).json({ error: 'Access denied. Admin or Teacher role required.' });
  }
  const { id, name, startDate, startPeriodId, endDate, endPeriodId, color, location, showInEventRow, resourceIds } = req.body;
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
          location: location || null,
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
          location: location || null,
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

// 行事の削除 (ADMIN/TEACHER権限)
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

// 祝日一覧取得 (認証必須)
app.get('/api/holidays', verifyToken, async (req, res) => {
  try {
    const holidays = await prisma.holiday.findMany();
    res.json(holidays);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch holidays' });
  }
});

// 祝日作成 (ADMIN のみ)
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

// 祝日更新 (ADMIN のみ)
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

// 祝日削除 (ADMIN のみ)
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

// Nager.Date からのインポート (ADMIN のみ)
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

// JSON ファイルからのインポート (ADMIN のみ)
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
    if (label) {
      if (!label.deliveryMethod) (label as any).deliveryMethod = "Delivery Method";
      if (!label.mainRoom) (label as any).mainRoom = "Main Room";
      if (!label.subject) (label as any).subject = "Subject";
    }
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
  // id が含まれている場合は削除（Prismaの更新エラー回避）
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

// カラーテーマ一覧取得 (認証必須)
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

// カラーテーマの一括更新/作成 (ADMIN権限)
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

// カラーテーマ削除 (ADMIN権限)
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
