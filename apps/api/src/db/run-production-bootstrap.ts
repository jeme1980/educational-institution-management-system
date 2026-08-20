import path from 'node:path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { bootstrapPlatformAdmin, bootstrapSystemData } from './system-bootstrap';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main(): Promise<void> {
  const databaseUrl = process.env['MIGRATION_DATABASE_URL'] || process.env['DATABASE_URL'];
  if (!databaseUrl) throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL is required for production bootstrap.');
  const client = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    await bootstrapSystemData(client);
    const platformAdmin = await bootstrapPlatformAdmin(client);
    console.log(`Production bootstrap completed. Platform administrator: ${platformAdmin}.`);
  } finally {
    await client.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Production bootstrap failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
