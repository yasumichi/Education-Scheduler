import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting migration: Backfilling courseId and lessonId in AuditLog');

  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { courseId: null },
        { lessonId: null }
      ]
    }
  });

  console.log(`Found ${logs.length} logs to check.`);

  let updatedCount = 0;

  for (const log of logs) {
    let courseId: string | null = null;
    let lessonId: string | null = null;

    try {
      const data = typeof log.data === 'string' ? JSON.parse(log.data) : log.data;

      if (log.tableName === 'Lesson') {
        if (log.action === 'DUPLICATE_LESSONS') {
          courseId = data.destinationCourseId;
        } else {
          // CREATE_LESSON, UPDATE_LESSON, DELETE_LESSON
          const target = data.new || data.old || data;
          if (target && typeof target === 'object') {
            if (target.courseId) courseId = target.courseId;
            if (target.id) lessonId = target.id;
          }
        }
      } else if (log.tableName === 'Resource') {
        if (['CREATE_COURSE', 'UPDATE_COURSE', 'DELETE_COURSE'].includes(log.action)) {
           const target = data.new || data.old || data;
           if (target && typeof target === 'object' && target.id) courseId = target.id;
        } else if (log.action === 'DUPLICATE_COURSE') {
           courseId = data.duplicatedId;
        }
      }

      if (courseId || lessonId) {
        await prisma.auditLog.update({
          where: { id: log.id },
          data: {
            courseId: courseId || log.courseId,
            lessonId: lessonId || log.lessonId
          }
        });
        updatedCount++;
      }
    } catch (e) {
      // Ignore parse errors or missing fields
      console.warn(`Failed to parse log ${log.id}:`, e);
    }
  }

  console.log(`Migration completed. Updated ${updatedCount} logs.`);
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
