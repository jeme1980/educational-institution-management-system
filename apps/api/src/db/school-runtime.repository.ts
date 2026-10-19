import type { Prisma } from '@prisma/client';
import type { Institution } from '@prisma/client';
import type { InstitutionSettingsUpdate } from '../validation/institution-settings.schemas';
import { prisma, getRequestTransaction } from './prisma';

type Client = Pick<Prisma.TransactionClient, '$queryRaw'>;
const schoolDb = (): Client => getRequestTransaction() || prisma;
export async function lockSchoolInstitution(db: Client, institutionId: string): Promise<boolean> {
  const [row] = await db.$queryRaw<{ locked: boolean }[]>`SELECT school_api.lock_institution(${institutionId}::uuid) AS locked`;
  return row.locked;
}
export async function schoolAccountSummaries(ids: string[], db: Client = schoolDb()) {
  return db.$queryRaw<{ id: string; email: string; mustChangePassword: boolean; isActive: boolean }[]>`SELECT * FROM school_api.school_accounts(${ids}::uuid[])`;
}
export async function createSchoolIdentity(email: string, hash: string, stamp: string, db: Client = schoolDb()): Promise<{id: string; mustChangePassword: boolean}> {
  const rows = await db.$queryRaw<{id: string; mustChangePassword: boolean}[]>`SELECT * FROM school_api.school_create_identity(${email}::text, ${hash}::text, ${stamp}::text)`;
  return rows[0];
}
export async function resetSchoolSetupStamp(id: string, stamp: string, db: Client = schoolDb()): Promise<void> {
  await db.$queryRaw`SELECT school_api.school_setup_stamp(${id}::uuid, ${stamp}::text)`;
}

function institutionDates(row: Institution | null): Institution | null {
  if (!row) return null;
  return { ...row, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt), archivedAt: row.archivedAt ? new Date(row.archivedAt) : null };
}
export async function schoolInstitution(id: string, db: Client = schoolDb()): Promise<Institution | null> {
  const [row] = await db.$queryRaw<{ value: Institution | null }[]>`SELECT school_api.institution_record(${id}::uuid) AS value`;
  return institutionDates(row.value);
}
export async function updateSchoolInstitution(id: string, data: InstitutionSettingsUpdate, db: Client = schoolDb()): Promise<Institution | null> {
  const [row] = await db.$queryRaw<{ value: Institution | null }[]>`SELECT school_api.institution_profile_update(
    ${id}::uuid, ${data.nameAr ?? null}::text, ${data.nameAr !== undefined}::boolean,
    ${data.nameHe || null}::text, ${data.nameHe !== undefined}::boolean,
    ${data.phoneNumber || null}::text, ${data.phoneNumber !== undefined}::boolean,
    ${data.email || null}::text, ${data.email !== undefined}::boolean,
    ${data.logoUrl || null}::text, ${data.logoUrl !== undefined}::boolean) AS value`;
  return institutionDates(row.value);
}

export async function revokePendingIdentitySessions(id: string, db: Client = schoolDb()) {
  await db.$queryRaw`SELECT school_api.school_revoke_pending_sessions(${id}::uuid)`;
}
