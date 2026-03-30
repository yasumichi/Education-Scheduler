import { PrismaClient, ResourceType, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // データのクリア
  await prisma.holiday.deleteMany();
  await prisma.scheduleEvent.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.resource.deleteMany();
  await prisma.user.deleteMany();
  await prisma.timePeriod.deleteMany();
  await prisma.resourceLabel.deleteMany();

  console.log('Clearing database...');

  // ユーザーの生成
  const adminPassword = await bcrypt.hash('admin123', 10);
  const teacherPassword = await bcrypt.hash('teacher123', 10);
  
  // 佐藤先生のユーザー (t1 に紐付ける)
  const userT1 = await prisma.user.create({
    data: {
      email: 'sato@example.com',
      password: teacherPassword,
      role: UserRole.TEACHER
    }
  });

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

  // 時限の生成
  const periods = [
    { id: 'p1', name: '1st Period', startTime: '09:00', endTime: '09:50', order: 1 },
    { id: 'p2', name: '2nd Period', startTime: '10:00', endTime: '10:50', order: 2 },
    { id: 'p3', name: '3rd Period', startTime: '11:00', endTime: '11:50', order: 3 },
    { id: 'p4', name: '4th Period', startTime: '12:00', endTime: '12:50', order: 4 },
    { id: 'p5', name: '5th Period', startTime: '13:50', endTime: '14:40', order: 5 },
    { id: 'p6', name: '6th Period', startTime: '14:50', endTime: '15:40', order: 6 },
    { id: 'p7', name: '7th Period', startTime: '15:50', endTime: '16:40', order: 7 },
    { id: 'p8', name: '8th Period', startTime: '16:50', endTime: '17:40', order: 8 },
  ];

  for (const p of periods) {
    await prisma.timePeriod.create({ data: p });
  }

  console.log('Seeding time periods...');

  // リソースラベルの生成
  await prisma.resourceLabel.create({
    data: {
      room: 'Room',
      teacher: 'Teacher',
      course: 'Course',
      event: 'Event',
      mainTeacher: 'Main Teacher',
      subTeacher: 'Sub Teacher'
    }
  });

  console.log('Seeding resource labels...');

  // リソースの生成
  // Rooms
  for (let i = 1; i <= 20; i++) {
    await prisma.resource.create({
      data: { id: `r${i}`, name: `Room ${100 + i}`, type: 'room', order: i }
    });
  }
  // Teachers
  const surnames = ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Kato', 'Yoshida', 'Yamada', 'Sasaki', 'Yamaguchi', 'Matsumoto', 'Inoue', 'Kimura', 'Hayashi', 'Saito', 'Shimizu'];
  for (let i = 1; i <= 20; i++) {
    await prisma.resource.create({
      data: { 
        id: `t${i}`, 
        name: `Dr. ${surnames[i-1]}`, 
        type: 'teacher', 
        order: i,
        // 佐藤先生 (t1) だけユーザーと紐付け
        userId: i === 1 ? userT1.id : undefined
      }
    });
  }
  // Courses
  const courseNames = ['Advanced Math', 'Practical English', 'Physics Inquiry', 'Japanese History B', 'Modern Writing', 'Basic Chemistry', 'World History A', 'Geography B', 'Biology Special', 'Politics & Economy', 'Classical Literature', 'Informatics I', 'Basic Arts', 'Physical Education', 'English Expression', 'Math IIB', 'Logical Japanese', 'Human Science', 'Career Inquiry', 'Multiculturalism'];
  for (let i = 1; i <= 20; i++) {
    await prisma.resource.create({
      data: { id: `c${i}`, name: `${courseNames[i-1]} Course`, type: 'course', order: i }
    });
  }

  console.log('Seeding resources...');

  // 授業の生成
  const subjects = ['Math', 'English', 'Physics', 'Japanese', 'Chemistry', 'History', 'Geography', 'Biology', 'Social', 'Info', 'Arts', 'PE'];
  const baseDate = '2026-03-26';

  for (let i = 1; i <= 20; i++) {
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

  // 複数サブ講師のテストデータ
  await prisma.lesson.create({
    data: {
      subject: 'Team Teaching: Research',
      teacherId: 't1', // Dr. Sato
      subTeachers: {
        connect: [{ id: 't2' }, { id: 't3' }] // Dr. Suzuki, Dr. Takahashi
      },
      roomId: 'r1',
      courseId: 'c1',
      startDate: '2026-03-26',
      startPeriodId: 'p3',
      endDate: '2026-03-26',
      endPeriodId: 'p4'
    }
  });

  // 日を跨ぐ集中講義
  await prisma.lesson.create({
    data: {
      subject: 'Special: Multiculturalism',
      teacherId: 't5',
      subTeachers: {
        connect: [{ id: 't1' }, { id: 't2' }]
      },
      roomId: 'r5',
      courseId: 'c20',
      startDate: '2026-03-26',
      startPeriodId: 'p1',
      endDate: '2026-03-27',
      endPeriodId: 'p4'
    }
  });

  console.log('Seeding lessons...');

  // イベント
  // 全体イベント
  await prisma.scheduleEvent.create({
    data: {
      name: 'Evacuation Drill',
      startDate: '2026-03-26',
      startPeriodId: 'p5',
      endDate: '2026-03-26',
      endPeriodId: 'p6',
      color: '#fee2e2',
      showInEventRow: true
    }
  });

  // リソース固有（加藤先生のみ、イベント行なし）
  await prisma.scheduleEvent.create({
    data: {
      name: 'Business Trip',
      startDate: '2026-03-26',
      startPeriodId: 'p1',
      endDate: '2026-03-26',
      endPeriodId: 'p8',
      color: '#d1fae5',
      showInEventRow: false,
      resources: {
        connect: [{ id: 't10' }]
      }
    }
  });

  // 両方（田中先生、104号室、イベント行あり）
  await prisma.scheduleEvent.create({
    data: {
      name: 'Open Research Lesson',
      startDate: '2026-03-26',
      startPeriodId: 'p2',
      endDate: '2026-03-26',
      endPeriodId: 'p3',
      color: '#fef3c7',
      showInEventRow: true,
      resources: {
        connect: [{ id: 't4' }, { id: 'r4' }]
      }
    }
  });

  // その他既存のイベント
  await prisma.scheduleEvent.create({
    data: { name: 'School Cleaning', startDate: '2026-03-26', startPeriodId: 'p7', endDate: '2026-03-26', endPeriodId: 'p8', color: '#e2e8f0', showInEventRow: true }
  });

  // 祝日
  await prisma.holiday.createMany({
    data: [
      { date: '2026-01-01', name: 'New Year\'s Day' },
      { date: '2026-02-11', name: 'Foundation Day' },
      { date: '2026-02-23', name: 'Emperor\'s Birthday' },
      { date: '2026-03-20', name: 'Vernal Equinox Day' },
      { date: '2026-04-29', name: 'Showa Day' },
      { start: '2026-12-29', end: '2027-01-03', name: 'Winter Holidays' }
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
