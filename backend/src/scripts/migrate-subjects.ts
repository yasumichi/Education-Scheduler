import { PrismaClient, ResourceType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting migration: Side-by-side Subject Migration');

  // 1. Create default Course Type
  const defaultType = await prisma.courseType.upsert({
    where: { id: 'default-general' },
    update: {},
    create: {
      id: 'default-general',
      name: 'General',
      order: 1,
    },
  });
  console.log(`Default Course Type created: ${defaultType.name}`);

  // 2. Assign all existing courses to the default type
  const coursesUpdate = await prisma.resource.updateMany({
    where: { type: ResourceType.course, courseTypeId: null },
    data: { courseTypeId: defaultType.id },
  });
  console.log(`Updated ${coursesUpdate.count} courses with default Course Type.`);

  // 3. Migrate unique CourseSubject names to Subject master
  const allCourseSubjects = await prisma.courseSubject.findMany({
    where: { subjectId: null, name: { not: null } },
  });

  const uniqueSubjectNames = Array.from(new Set(allCourseSubjects.map(cs => cs.name as string)));
  console.log(`Found ${uniqueSubjectNames.length} unique subject names to migrate.`);

  for (const name of uniqueSubjectNames) {
    const subjectMaster = await prisma.subject.create({
      data: {
        name,
        level: 1,
        courseTypeId: defaultType.id,
        order: 0,
      },
    });

    await prisma.courseSubject.updateMany({
      where: { name, subjectId: null },
      data: { subjectId: subjectMaster.id },
    });
    console.log(`Migrated subject: ${name}`);
  }

  console.log('Migration completed successfully.');
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
