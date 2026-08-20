import path from 'node:path';
import dotenv from 'dotenv';
import { seedDevelopmentDatabase } from './seed';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main(): Promise<void> {
  await seedDevelopmentDatabase();
}

main().catch((error: unknown) => {
  console.error('Database seeding failed:', error);
  process.exitCode = 1;
});
