import { Prisma, PrismaClient } from '@prisma/client';
import { platformPrisma } from './platform-prisma';

type RawClient = Pick<PrismaClient, '$queryRaw'>;
interface UsageRow { students: bigint; staff: bigint; users: bigint }
interface DependencyRow { dependency_type: string; count: bigint }

export type PlatformReferenceDependencyKind =
  | 'regions' | 'towns' | 'languages' | 'educationTypes' | 'educationStages'
  | 'gradeLevels' | 'classTypes' | 'compositionTypes' | 'genders'
  | 'studentStatuses' | 'enrollmentStatuses' | 'relationTypes' | 'studentFeatures';

function safeCount(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Platform metric exceeds the safe JSON integer range.');
  }
  return Number(value);
}

export async function getInstitutionUsage(
  institutionId: string,
  client: RawClient = platformPrisma,
): Promise<{ students: number; staff: number; users: number }> {
  const rows = await client.$queryRaw<UsageRow[]>(Prisma.sql`
    SELECT students, staff, users
    FROM platform_api.platform_get_institution_usage(${institutionId}::uuid)
  `);
  if (rows.length !== 1) throw new Error('Platform institution usage returned an invalid result.');
  const row = rows[0]!;
  return { students: safeCount(row.students), staff: safeCount(row.staff), users: safeCount(row.users) };
}

export async function getReferenceDependencyCounts(
  kind: PlatformReferenceDependencyKind,
  referenceId: string,
  client: RawClient = platformPrisma,
): Promise<{ type: string; count: number }[]> {
  const rows = await client.$queryRaw<DependencyRow[]>(Prisma.sql`
    SELECT dependency_type, count
    FROM platform_api.platform_reference_dependency_counts(${kind}, ${referenceId}::uuid)
  `);
  return rows.map((row) => ({ type: row.dependency_type, count: safeCount(row.count) }));
}
