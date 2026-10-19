import { findAuthIdentityStateById, authSessionById } from '../db/auth-runtime.repository';
import { Response, NextFunction } from 'express';
import { tenantIsolationMiddleware } from './tenantIsolation.middleware';
import { ContextRequest } from './context';
import { rlsRequestTransaction } from './rls-request.middleware';

interface LocalAuthUser {
  uid: string;
  email: string;
  sid?: string;
  isPlatformAdmin?: boolean;
}

export interface AuthRequest extends ContextRequest {
  user?: LocalAuthUser;
}

const localJwtSecret = (): Uint8Array => {
  const value = process.env['AUTH_JWT_SECRET']?.trim();
  if (!value || value.length < 32) {
    throw new Error('AUTH_JWT_SECRET must be configured with at least 32 characters');
  }
  return new TextEncoder().encode(value);
};

export async function createLocalAccessToken(userId: string, email: string, securityStamp?: string | null, sessionId?: string): Promise<string> {
  const { SignJWT } = await import('jose');
  const payload: Record<string, string> = { email, tokenType: 'access' };
  if (securityStamp) payload['securityStamp'] = securityStamp;
  if (sessionId) payload['sid'] = sessionId;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(process.env['ACCESS_TOKEN_TTL']?.trim() || '15m')
    .sign(localJwtSecret());
}

async function verifyLocalAccessToken(token: string): Promise<LocalAuthUser> {
  const { jwtVerify } = await import('jose');
  const { payload } = await jwtVerify(token, localJwtSecret(), { algorithms: ['HS256'] });
  const email = typeof payload['email'] === 'string' ? payload['email'] : '';
  if (payload['tokenType'] !== 'access' || !payload.sub || !email) {
    throw new Error('Local access token is missing required claims');
  }
  const user = await findAuthIdentityStateById(payload.sub);
  const sessionId = typeof payload['sid'] === 'string' ? payload['sid'] : undefined;
  const session = sessionId ? await authSessionById(sessionId) : null;
  if (!user?.isActive || user.mustChangePassword || (payload['securityStamp'] && payload['securityStamp'] !== user.securityStamp)
    || (sessionId && (!session || session.userId !== user.id || session.revokedAt || session.expiresAt <= new Date()))) {
    throw new Error('The user session is no longer valid');
  }
  return {
    uid: payload.sub,
    email,
    sid: typeof payload['sid'] === 'string' ? payload['sid'] : undefined,
    isPlatformAdmin: user.isPlatformAdmin,
  };
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication is required.' });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (token.split('.').length !== 3 || token.split('.').some((part) => !part)) {
    return res.status(401).json({ error: 'The access token is invalid. Please sign in again.' });
  }

  try {
    req.user = await verifyLocalAccessToken(token);
    if (req.user.isPlatformAdmin) return next();
    return tenantIsolationMiddleware(req, res, () => { void rlsRequestTransaction(req, res, next); });
  } catch (error) {
    console.error('Error verifying local access token:', error);
    return res.status(401).json({ error: 'The access token is invalid or expired.' });
  }
};
