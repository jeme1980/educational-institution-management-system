import type { Prisma, PrismaClient } from '@prisma/client';
import { platformPrisma } from './platform-prisma';

type PlatformContextClient = Pick<PrismaClient, '$transaction'>;

/**
 * Platform onboarding may touch a narrow set of tenant identity tables. It
 * does so under the same tenant RLS context used by school runtime requests;
 * the platform role never receives BYPASSRLS.
 */
export function withPlatformInstitutionContext<T>(
  institutionId: string,
  callback: (transaction: Prisma.TransactionClient) => Promise<T>,
  client: PlatformContextClient = platformPrisma,
): Promise<T> {
  return client.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(
      `SELECT set_config('app.current_institution_id', $1, true)`,
      institutionId,
    );
    return callback(transaction);
  });
}
