import { PrismaClient } from '@prisma/client';

const url = process.env['TEST_ADMIN_DATABASE_URL'] || process.env['MIGRATION_DATABASE_URL'] || process.env['DATABASE_URL'];

if (!url) throw new Error('A test admin database URL is required for fixture setup.');
if (process.env['NODE_ENV'] === 'production') throw new Error('Test fixture database access is disabled in production.');

/** Administrative client for test fixture setup/cleanup only; never import in application routes. */
export const testAdminPrisma = new PrismaClient({ datasources: { db: { url } } });
