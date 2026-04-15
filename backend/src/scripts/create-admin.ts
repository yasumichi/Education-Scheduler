import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function createAdmin() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Usage: npx ts-node src/scripts/create-admin.ts <email> <password>');
    process.exit(1);
  }

  const email = args[0];
  const password = args[1];

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        password: hashedPassword,
        role: UserRole.ADMIN,
      },
      create: {
        email,
        password: hashedPassword,
        role: UserRole.ADMIN,
      },
    });

    console.log(`Admin user ${user.email} created/updated successfully.`);
  } catch (error) {
    console.error('Error creating admin user:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

createAdmin();
