import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// 基本的なヘルスチェック
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'EduGrid Scheduler Backend is running' });
});

// リソース一覧取得
app.get('/api/resources', async (req, res) => {
  try {
    const resources = await prisma.resource.findMany({
      orderBy: { order: 'asc' }
    });
    res.json(resources);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch resources' });
  }
});

// 授業一覧取得
app.get('/api/lessons', async (req, res) => {
  try {
    const lessons = await prisma.lesson.findMany();
    res.json(lessons);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch lessons' });
  }
});

// イベント一覧取得
app.get('/api/events', async (req, res) => {
  try {
    const events = await prisma.scheduleEvent.findMany();
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// 祝日一覧取得
app.get('/api/holidays', async (req, res) => {
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
