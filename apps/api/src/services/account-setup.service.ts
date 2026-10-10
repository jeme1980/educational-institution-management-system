import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { hashPassword } from '../security/password';
import { HttpError } from '../middleware/errorHandler.middleware';

export const ACCOUNT_SETUP_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

type SetupTokenDb = Pick<Prisma.TransactionClient, 'userAccountSetupToken'>;

export type AccountSetupStatus = 'PENDING_SETUP' | 'SETUP_EXPIRED' | 'ACTIVE' | 'DISABLED';
export interface SetupMutationResult { expiresAt: Date; setupUrl: string }
export interface SetupStatusResult { expiresAt: Date; usedAt: Date | null }

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

export function accountSetupUrl(rawToken: string, base = process.env['ACCOUNT_SETUP_URL_BASE'] || 'http://localhost:4200/account/setup'): string {
  return `${base}${base.includes('?') ? '&' : '?'}token=${encodeURIComponent(rawToken)}`;
}

/** Resolve before provisioning writes so a missing production delivery URL cannot create an undeliverable account. */
export function initialAdminSetupUrlBase(): string {
  const base = process.env['ACCOUNT_SETUP_URL_BASE']?.trim();
  if (process.env['NODE_ENV'] !== 'production') return base || 'http://localhost:4200/account/setup';
  if (!base) throw new HttpError(503, 'ACCOUNT_SETUP_URL_BASE is required for initial administrator delivery.', 'ACCOUNT_SETUP_URL_NOT_CONFIGURED');
  let url: URL;
  try { url = new URL(base); } catch { throw new HttpError(503, 'ACCOUNT_SETUP_URL_BASE must be a valid HTTPS account setup URL.', 'ACCOUNT_SETUP_URL_INVALID'); }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.startsWith('127.') || hostname === '[::1]' || hostname === '0.0.0.0'
    || url.username || url.password || url.hash || url.searchParams.has('token') || !url.pathname.replace(/\/$/, '').endsWith('/account/setup')) {
    throw new HttpError(503, 'ACCOUNT_SETUP_URL_BASE must be a public HTTPS account setup URL.', 'ACCOUNT_SETUP_URL_INVALID');
  }
  return base;
}

export function initialAdminSetupDeliveryMetadata(setup: { rawToken: string; expiresAt: Date }, base: string): SetupMutationResult {
  return { expiresAt: setup.expiresAt, setupUrl: accountSetupUrl(setup.rawToken, base) };
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
