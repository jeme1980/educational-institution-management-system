import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { hashPassword } from '../security/password';

export const ACCOUNT_SETUP_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

type SetupTokenDb = Pick<Prisma.TransactionClient, 'userAccountSetupToken'>;

export type AccountSetupStatus = 'PENDING_SETUP' | 'SETUP_EXPIRED' | 'ACTIVE' | 'DISABLED';

export function setupTokenHash(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * The User schema requires a password hash. Pending accounts receive an
 * account-specific, high-entropy secret that is never returned or persisted in
 * plaintext, so it cannot be used as a temporary credential.
 */
export async function createPendingAccountPasswordHash(): Promise<string> {
  return hashPassword(crypto.randomBytes(64).toString('base64url'));
}

export async function issueAccountSetupToken(db: SetupTokenDb, userId: string): Promise<{ rawToken: string; expiresAt: Date }> {
  const now = new Date();
  await db.userAccountSetupToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: now },
  });

  const rawToken = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + ACCOUNT_SETUP_TOKEN_TTL_MS);
  await db.userAccountSetupToken.create({
    data: { userId, tokenHash: setupTokenHash(rawToken), expiresAt },
  });
  return { rawToken, expiresAt };
}

export function accountSetupUrl(rawToken: string): string {
  const base = process.env['ACCOUNT_SETUP_URL_BASE'] || 'http://localhost:4200/account/setup';
  return `${base}${base.includes('?') ? '&' : '?'}token=${encodeURIComponent(rawToken)}`;
}

export function setupDeliveryMetadata(setup: { rawToken: string; expiresAt: Date }): { expiresAt: Date; setupUrl?: string } {
  return process.env['NODE_ENV'] === 'production'
    ? { expiresAt: setup.expiresAt }
    : { expiresAt: setup.expiresAt, setupUrl: accountSetupUrl(setup.rawToken) };
}

export function resolveAccountSetupStatus(input: {
  userActive: boolean;
  membershipActive: boolean;
  membershipArchivedAt?: Date | null;
  pendingSetup: boolean;
  latestToken?: { usedAt: Date | null; expiresAt: Date } | null;
  now?: Date;
}): AccountSetupStatus {
  if (!input.userActive || !input.membershipActive || input.membershipArchivedAt) return 'DISABLED';
  if (!input.pendingSetup) return 'ACTIVE';
  const now = input.now || new Date();
  return input.latestToken && !input.latestToken.usedAt && input.latestToken.expiresAt > now
    ? 'PENDING_SETUP'
    : 'SETUP_EXPIRED';
}
