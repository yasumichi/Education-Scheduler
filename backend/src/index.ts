import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient, UserRole } from '@prisma/client';
import { verifyToken, AuthRequest } from './authMiddleware';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

app.use(cors());
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
      orderBy: { order: 'asc' }
    });
    res.json(resources);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch resources' });
  }
});

// 授業一覧取得 (認証必須)
app.get('/api/lessons', verifyToken, async (req, res) => {
  try {
    const lessons = await prisma.lesson.findMany();
    res.json(lessons);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
});

// イベント一覧取得 (認証必須)
app.get('/api/events', verifyToken, async (req, res) => {
  try {
    const events = await prisma.scheduleEvent.findMany();
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch events' });
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

app.listen(port, () => {
  console.log(`Backend server is running on http://localhost:${port}`);
});
