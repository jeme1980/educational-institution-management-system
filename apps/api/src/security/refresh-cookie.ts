import type { Request, Response } from 'express';

export const REFRESH_COOKIE_NAME = process.env['REFRESH_COOKIE_NAME'] || 'school_refresh_token';

function cookieConfig() {
  const sameSite = (process.env['COOKIE_SAMESITE'] || 'lax').toLowerCase();
  return {
    secure: process.env['COOKIE_SECURE'] === 'true' || (process.env['COOKIE_SECURE'] !== 'false' && process.env['NODE_ENV'] === 'production'),
    sameSite: sameSite === 'strict' || sameSite === 'none' ? sameSite : 'lax',
    path: process.env['COOKIE_PATH'] || '/api/auth',
    domain: process.env['COOKIE_DOMAIN']?.trim() || undefined,
    maxAgeSeconds: 30 * 24 * 60 * 60,
  };
}

function serialize(value: string, maxAge: number): string {
  const config = cookieConfig();
  const parts = [`${REFRESH_COOKIE_NAME}=${encodeURIComponent(value)}`, `Max-Age=${maxAge}`, `Path=${config.path}`, `SameSite=${config.sameSite}`];
  if (config.domain) parts.push(`Domain=${config.domain}`);
  if (config.secure) parts.push('Secure');
  parts.push('HttpOnly');
  return parts.join('; ');
}

function appendCookie(res: Response, value: string, maxAge: number): void {
  const header = serialize(value, maxAge);
  const current = res.getHeader('Set-Cookie');
  const headers = Array.isArray(current) ? [...current.map(String), header] : current ? [String(current), header] : [header];
  res.setHeader('Set-Cookie', headers);
}

export function setRefreshCookie(res: Response, token: string): void {
  appendCookie(res, token, cookieConfig().maxAgeSeconds);
}

export function clearRefreshCookie(res: Response): void {
  appendCookie(res, '', 0);
}

export function readRefreshCookie(req: Request): string | null {
  const header = req.headers.cookie || '';
  const match = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${REFRESH_COOKIE_NAME}=`));
  if (!match) return null;
  try { return decodeURIComponent(match.slice(REFRESH_COOKIE_NAME.length + 1)) || null; } catch { return null; }
}

export function hasTrustedOrigin(req: Request): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  const allowed = (process.env['CORS_ORIGINS'] || process.env['APP_URL'] || '').split(',').map((value) => value.trim().replace(/\/$/, '')).filter(Boolean);
  return allowed.length === 0 || allowed.includes(origin.replace(/\/$/, ''));
}
