import crypto from 'node:crypto';
import type { Response } from 'express';
import type { ContextRequest } from '../middleware/context';
import { platformPrisma } from '../db/platform-prisma';
import { hashPassword } from '../security/password';
import { PASSWORD_POLICY_MESSAGE, validatePasswordPolicy } from '../security/password-policy';
import { setupTokenHash } from '../services/account-setup.service';
import { recordPlatformAuditEvent } from '../services/platform-audit.service';
import { recordAuditEvent } from '../services/audit.service';

export async function completeAccountSetup(req: ContextRequest, res: Response): Promise<void> {
  const rawToken = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const confirmation = typeof req.body?.confirmPassword === 'string' ? req.body.confirmPassword : password;
  if (!rawToken || !password) { res.status(400).json({ error: 'Setup token and password are required.' }); return; }
  if (password !== confirmation) { res.status(400).json({ error: 'Passwords do not match.' }); return; }
  if (!validatePasswordPolicy(password)) { res.status(400).json({ error: PASSWORD_POLICY_MESSAGE, code: 'PASSWORD_POLICY_VIOLATION' }); return; }
  try {
    const result = await platformPrisma.$transaction(async (tx) => {
      const token = await tx.userAccountSetupToken.findUnique({ where: { tokenHash: setupTokenHash(rawToken), }, include: { user: { include: { institutionUsers: { orderBy: { createdAt: 'asc' } } } } } });
      const institutionUser = token?.user.institutionUsers.find((membership) => membership.isActive && !membership.archivedAt) || token?.user.institutionUsers[0];
      if (!token || token.usedAt || token.expiresAt <= new Date() || !token.user.mustChangePassword || !institutionUser) throw Object.assign(new Error('The setup token is invalid, expired, or already used.'), { statusCode: 400, code: 'ACCOUNT_SETUP_TOKEN_INVALID' });
      if (!token.user.isActive || !institutionUser.isActive || institutionUser.archivedAt) throw Object.assign(new Error('The account is disabled and cannot be set up.'), { statusCode: 409, code: 'ACCOUNT_DISABLED' });
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.current_institution_id', $1, true)`,
        institutionUser.institutionId,
      );
      const updated = await tx.userAccountSetupToken.updateMany({ where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (updated.count !== 1) throw Object.assign(new Error('The setup token is no longer valid.'), { statusCode: 400, code: 'ACCOUNT_SETUP_TOKEN_INVALID' });
      await tx.user.update({ where: { id: token.userId }, data: { passwordHash: await hashPassword(password), securityStamp: crypto.randomUUID(), mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: null } });
      await tx.userSession.updateMany({ where: { userId: token.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await recordPlatformAuditEvent({ action: 'ACCOUNT_SETUP_COMPLETED', entityType: 'User', entityId: token.userId, targetInstitutionId: institutionUser.institutionId, metadata: { userId: token.userId } }, tx);
      await recordAuditEvent(tx, { institutionId: institutionUser.institutionId, action: 'ACCOUNT_SETUP_COMPLETED', entityType: 'User', entityId: token.userId, metadata: { userId: token.userId } });
      return { institutionId: institutionUser.institutionId };
    });
    res.json({ message: 'Account setup completed. You can now sign in.', institutionId: result.institutionId });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode);
    if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 500) {
      res.status(statusCode).json({ error: error?.message || 'Account setup failed.', ...(error?.code ? { code: error.code } : {}) });
      return;
    }
    throw error;
  }
}
