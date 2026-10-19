import crypto from 'node:crypto';

export function createRefreshToken(): string {
  return crypto.randomBytes(64).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function refreshTokenExpiry(now = new Date()): Date {
  const configuredDays = Number(process.env['REFRESH_TOKEN_TTL_DAYS'] || '30');
  const days = Number.isFinite(configuredDays) && configuredDays > 0 && configuredDays <= 30 ? configuredDays : 30;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}
