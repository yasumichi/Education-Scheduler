import { PrismaClient, ResourceType, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // データのクリア
  await prisma.lesson.deleteMany();
  await prisma.resource.deleteMany();
  await prisma.scheduleEvent.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.user.deleteMany();

  console.log('Clearing database...');

  // ユーザーの生成
  const adminPassword = await bcrypt.hash('admin123', 10);
  const teacherPassword = await bcrypt.hash('teacher123', 10);

  await prisma.user.create({
    data: {
      email: 'admin@example.com',
      password: adminPassword,
      role: UserRole.ADMIN
    }
  });

  await prisma.user.create({
    data: {
      email: 'teacher@example.com',
      password: teacherPassword,
      role: UserRole.TEACHER
    }
  });

  console.log('Seeding users...');

  // リソースの生成
  const resources = [];
  // Rooms
  for (let i = 1; i <= 20; i++) {
    resources.push(await prisma.resource.create({
      data: { id: `r${i}`, name: `${100 + i}号室`, type: 'room', order: i }
    }));
  }
  // Teachers
  const surnames = ['佐藤', '鈴木', '高橋', '田中', '渡辺', '伊藤', '山本', '中村', '小林', '加藤', '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水'];
  for (let i = 1; i <= 20; i++) {
    resources.push(await prisma.resource.create({
      data: { id: `t${i}`, name: `${surnames[i-1]} 先生`, type: 'teacher', order: i }
    }));
  }
  // Courses
  const courseNames = ['特進数学', '実用英語', '物理探究', '日本史B', '現代文演習', '化学基礎', '世界史A', '地理B', '生物特講', '政治経済', '古典特講', '情報I', '芸術基礎', '体育特論', '英語表現', '数学IIB', '論理国語', '科学人間学', 'キャリア探究', '多文化理解'];
  for (let i = 1; i <= 20; i++) {
    resources.push(await prisma.resource.create({
      data: { id: `c${i}`, name: `${courseNames[i-1]}講座`, type: 'course', order: i }
    }));
  }

  console.log('Seeding resources...');

  // 授業の生成
  const subjects = ['数学', '英語', '物理', '国語', '化学', '歴史', '地理', '生物', '社会', '情報', '芸術', '体育'];
  const baseDate = '2026-03-26';

  for (let i = 1; i <= 30; i++) {
    const periodNum = (i % 8) + 1;
    await prisma.lesson.create({
      data: {
        subject: subjects[i % subjects.length],
        teacherId: `t${(i % 20) + 1}`,
        roomId: `r${(i % 20) + 1}`,
        courseId: `c${(i % 20) + 1}`,
        startDate: baseDate,
        startPeriodId: `p${periodNum}`,
        endDate: baseDate,
        endPeriodId: `p${periodNum}`
      }
    });
  }

  // 集中講義
  await prisma.lesson.create({
    data: {
      subject: '集中講義:多文化共生',
      teacherId: 't5',
      roomId: 'r5',
      courseId: 'c20',
      startDate: '2026-03-26',
      startPeriodId: 'p1',
      endDate: '2026-03-27',
      endPeriodId: 'p4'
    }
  });

  // 4月のデータ
  const aprilDate = '2026-04-06';
  for (let i = 1; i <= 10; i++) {
    await prisma.lesson.create({
      data: {
        subject: subjects[i % subjects.length],
        teacherId: `t${i}`,
        roomId: `r${i}`,
        courseId: `c${i}`,
        startDate: aprilDate,
        startPeriodId: `p${i % 8 + 1}`,
        endDate: aprilDate,
        endPeriodId: `p${i % 8 + 1}`
      }
    });
  }

  console.log('Seeding lessons...');

  // イベント
  await prisma.scheduleEvent.createMany({
    data: [
      { name: '校内清掃', startDate: '2026-03-26', startPeriodId: 'p7', endDate: '2026-03-26', endPeriodId: 'p8', color: '#e2e8f0' },
      { name: '三者面談期間', startDate: '2026-03-24', startPeriodId: 'p1', endDate: '2026-03-26', endPeriodId: 'p8', color: '#fef3c7' },
      { name: '入学式', startDate: '2026-04-06', startPeriodId: 'p1', endDate: '2026-04-06', endPeriodId: 'p8', color: '#fee2e2' },
      { name: 'オリエンテーション期間', startDate: '2026-04-07', startPeriodId: 'p1', endDate: '2026-04-10', endPeriodId: 'p8', color: '#f0f9ff' }
    ]
  });

  // 祝日
  await prisma.holiday.createMany({
    data: [
      { date: '2026-01-01', name: '元日' },
      { date: '2026-02-11', name: '建国記念の日' },
      { date: '2026-02-23', name: '天皇誕生日' },
      { date: '2026-03-20', name: '春分の日' },
      { date: '2026-04-29', name: '昭和の日' },
      { start: '2026-12-29', end: '2027-01-03', name: '年末年始休暇' }
    ]
  });

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
