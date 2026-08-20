import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import dotenv from 'dotenv';
import { resolvePlatformDatabaseUrl } from './platform-database-config';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
const globalForPlatform = globalThis as unknown as { platformPrisma?: PrismaClient };
const platformDatabaseUrl = resolvePlatformDatabaseUrl();
export const platformPrisma = globalForPlatform.platformPrisma ?? new PrismaClient({ datasources: { db: { url: platformDatabaseUrl } } });
if (process.env['NODE_ENV'] !== 'production') globalForPlatform.platformPrisma = platformPrisma;
