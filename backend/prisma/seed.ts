import { PrismaClient, ColorCategory } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Clear configuration data (except for preserved data)
  await prisma.timePeriod.deleteMany();
  await prisma.resourceLabel.deleteMany();
  await prisma.systemSetting.deleteMany();
  await prisma.colorTheme.deleteMany();

  console.log('Clearing configuration data...');

  // Generate time periods
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

  // Generate resource labels
  await prisma.resourceLabel.create({
    data: {
      room: 'Room',
      teacher: 'Teacher',
      course: 'Course',
      event: 'Event',
      mainTeacher: 'Main Teacher',
      subTeacher: 'Sub Teacher',
      mainRoom: 'Main Room',
      deliveryMethod: 'Delivery Method',
      subject: 'Subject'
    }
  });

  console.log('Seeding resource labels...');

  await prisma.systemSetting.create({
    data: {
      allowPublicSignup: true,
      yearViewStartMonth: 4,
      yearViewStartDay: 1
    }
  });

  console.log('Seeding system settings...');

  // Color themes
  await prisma.colorTheme.createMany({
    data: [
      { name: 'Default Event', category: ColorCategory.EVENT, key: 'default', background: '#fef3c7', foreground: '#92400e', order: 1 },
      { name: 'Business Trip', category: ColorCategory.EVENT, background: '#d1fae5', foreground: '#065f46', order: 2 },
      { name: 'Holiday Event', category: ColorCategory.EVENT, background: '#fee2e2', foreground: '#991b1b', order: 3 },
      { name: 'With Main Teacher', category: ColorCategory.LESSON, key: 'with-teacher', background: '#646cff', foreground: '#ffffff', order: 1 },
      { name: 'No Main Teacher', category: ColorCategory.LESSON, key: 'no-teacher', background: '#e884fa', foreground: '#ffffff', order: 2 },
      { name: 'Default Holiday', category: ColorCategory.HOLIDAY, key: 'default', background: '#ff8181', foreground: '#ffffff', order: 1 },
      { name: 'Weekend', category: ColorCategory.HOLIDAY, key: 'vivid', background: '#1a3a5a', foreground: '#ffffff', order: 2 }
    ]
  });

  console.log('Seeding configuration finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
