import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
let client: PrismaClient | undefined;
/** Private capability client. Never falls back to school, platform, or owner URLs. */
function authDb(): PrismaClient {
  if (!client) {
    const url = process.env['AUTH_RUNTIME_DATABASE_URL'];
    if (!url) throw new Error('AUTH_RUNTIME_DATABASE_URL is required.');
    const parsed = new URL(url);
    if (decodeURIComponent(parsed.username) !== 'school_auth_app') throw new Error('Authentication database must use school_auth_app.');
    client = new PrismaClient({ datasourceUrl: url });
  }
  return client;
}
export async function closeAuthDatabase(): Promise<void> { await client?.$disconnect(); }
export async function checkAuthDatabase(): Promise<void> {
  const [role] = await authDb().$queryRaw<{ safe: boolean }[]>`SELECT current_user='school_auth_app' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AS safe FROM pg_roles WHERE rolname=current_user`;
  if (!role?.safe) throw new Error('Unsafe authentication database role.');
}
export interface AuthIdentity {
  id: string; email: string; normalizedEmail: string; passwordHash: string;
  securityStamp: string | null; isActive: boolean; isPlatformAdmin: boolean;
  mustChangePassword: boolean; failedLoginAttempts: number;
  lockedUntil: Date | null;
}
export interface IdentityMembership {
  id: string; institutionId: string; isActive: boolean; archivedAt: Date | null;
  institution: { archivedAt: Date | null };
}
interface MembershipRow extends Omit<IdentityMembership, 'institution'> { institutionArchivedAt: Date | null }
export interface AuthSession {
  id: string; userId: string; expiresAt: Date; revokedAt: Date | null;
}
type AuthState = Omit<AuthIdentity, 'passwordHash' | 'failedLoginAttempts'>;

/** JWT/session validation does not retrieve a password hash into application memory. */
export async function findAuthIdentityStateById(id: string): Promise<AuthState | null> {
  const rows = await authDb().$queryRaw<AuthState[]>`SELECT id,email,"normalizedEmail","securityStamp","isActive","isPlatformAdmin","mustChangePassword","lockedUntil" FROM auth_api.auth_identity_id(${id}::uuid)`;
  return rows[0] || null;
}

export async function findAuthIdentityByEmail(email: string): Promise<AuthIdentity | null> {
  const rows = await authDb().$queryRaw<AuthIdentity[]>`SELECT * FROM auth_api.auth_login_identity_email(${email}::text)`;
  return rows[0] || null;
}
export async function identityMemberships(id: string): Promise<IdentityMembership[]> {
  const rows = await authDb().$queryRaw<MembershipRow[]>`SELECT * FROM auth_api.auth_memberships(${id}::uuid)`;
  return rows.map(({ institutionArchivedAt, ...row }) => ({ ...row, institution: { archivedAt: institutionArchivedAt } }));
}
export async function recordFailedLogin(id: string, attempts: number, lockedUntil: Date | null): Promise<void> {
  await authDb().$queryRaw`SELECT auth_api.auth_failed_login(${id}::uuid, ${attempts}::integer, ${lockedUntil?.toISOString() || null}::timestamp)`;
}
export async function recordSuccessfulLogin(id: string): Promise<void> {
  await authDb().$queryRaw`SELECT auth_api.auth_successful_login(${id}::uuid)`;
}
export async function createAuthSession(id: string, hash: string, expires: Date, ip: string | null, agent: string | null): Promise<AuthSession> {
  const rows = await authDb().$queryRaw<AuthSession[]>`SELECT * FROM auth_api.session_create(${id}::uuid, ${hash}::text, ${expires.toISOString()}::timestamp, ${ip}::text, ${agent}::text)`;
  return rows[0];
}
export async function authSessionById(id: string): Promise<AuthSession | null> {
  const rows = await authDb().$queryRaw<AuthSession[]>`SELECT * FROM auth_api.session_id(${id}::uuid)`;
  return rows[0] || null;
}
export async function authSessionByHash(hash: string): Promise<AuthSession | null> {
  const rows = await authDb().$queryRaw<AuthSession[]>`SELECT * FROM auth_api.session_hash(${hash}::text)`;
  return rows[0] || null;
}
export async function rotateAuthSession(id: string, oldHash: string, newHash: string, expires: Date): Promise<number> {
  const [row] = await authDb().$queryRaw<{ count: number }[]>`SELECT auth_api.session_rotate(${id}::uuid, ${oldHash}::text, ${newHash}::text, ${expires.toISOString()}::timestamp) AS count`;
  return row.count;
}
export async function passwordIdentity(sessionId: string) {
  const rows = await authDb().$queryRaw<{ id: string; passwordHash: string }[]>`SELECT * FROM auth_api.auth_password_identity(${sessionId}::uuid)`;
  return rows[0] || null;
}
export async function upgradePassword(email: string, oldHash: string, newHash: string) {
  const [row] = await authDb().$queryRaw<{ changed: boolean }[]>`SELECT auth_api.auth_upgrade_password(${email}::text,${oldHash}::text,${newHash}::text) AS changed`;
  return row.changed;
}
export async function changeOwnPassword(session: string, oldHash: string, newHash: string, institution: string | null) {
  const [row] = await authDb().$queryRaw<{ changed: boolean }[]>`SELECT auth_api.auth_change_password(${session}::uuid,${oldHash}::text,${newHash}::text,${institution}::uuid) AS changed`;
  return row.changed;
}
export async function revokeAuthSession(hash: string) {
  await authDb().$queryRaw`SELECT auth_api.session_revoke_hash(${hash}::text)`;
}
/** A verified access JWT's sid, never a supplied userId. */
export async function revokeCurrentIdentitySessions(session: string) {
  const [row] = await authDb().$queryRaw<{ changed: boolean }[]>`SELECT auth_api.sessions_revoke_current(${session}::uuid) AS changed`;
  return row.changed;
}
