import { passwordIdentity, upgradePassword, changeOwnPassword, findAuthIdentityByEmail, findAuthIdentityStateById, identityMemberships, recordFailedLogin, recordSuccessfulLogin, createAuthSession, authSessionByHash, rotateAuthSession, revokeAuthSession, revokeCurrentIdentitySessions } from '../db/auth-runtime.repository';
import { Response } from 'express';
import { ContextRequest } from '../middleware/context';
import { prisma } from '../db/prisma';
import { createLocalAccessToken, type AuthRequest } from '../middleware/auth';
import { hashPassword, isLegacyPasswordHash, verifyPassword } from '../security/password';
import { createRefreshToken, hashRefreshToken, refreshTokenExpiry } from '../security/session';
import { withRlsContext } from '../middleware/rls-request.middleware';
import { PASSWORD_POLICY_MESSAGE, validatePasswordPolicy } from '../security/password-policy';
import { clearRefreshCookie, hasTrustedOrigin, readRefreshCookie, setRefreshCookie } from '../security/refresh-cookie';
type AuthenticatedUser = { name?: string; displayName?: string };

async function createUserSession(user: any, req: ContextRequest) {
  const refreshToken = createRefreshToken();
  const session = await createAuthSession(user.id, hashRefreshToken(refreshToken), refreshTokenExpiry(), req.ip?.slice(0, 64) || null, String(req.headers?.['user-agent'] || '').slice(0, 500) || null);
  const token = await createLocalAccessToken(user.id, user.email, user.securityStamp, session.id);
  return { token, refreshToken };
}

export async function invalidateUserSessions(sessionId: string): Promise<void> {
  await revokeCurrentIdentitySessions(sessionId);
}

export async function buildUserContext(user: any, requestInstitutionId?: string) {
  if (user.isPlatformAdmin) {
    return {
      user: { id: user.id, uid: user.id, email: user.email, displayName: user.displayName || user.email, role: 'PLATFORM_ADMIN', institutionId: null, isActive: user.isActive, isPlatformAdmin: true, photoUrl: null },
      institutionId: '', academicYear: null, staffMember: null, permissions: [], isPlatformAdmin: true,
    };
  }
  const institutionId = user.institutionId || requestInstitutionId || '';

  // 1. Fetch current active academic year for this institution
  let activeYear = null;
  try {
    const currentYear = await prisma.academicYear.findFirst({
      where: { institutionId, isCurrent: true },
    });
    if (currentYear) {
      activeYear = currentYear;
    } else {
      // Fallback: any active academic year for this institution
      activeYear = await prisma.academicYear.findFirst({ where: { institutionId } });
    }
  } catch (err) {
    console.error('Error fetching active year:', err);
  }

  // 2. Fetch associated staff member
  let staffMember = null;
  try {
    const instUser = await prisma.institutionUser.findFirst({
      where: { userId: user.id, institutionId, isActive: true, archivedAt: null },
      select: { staffMemberId: true },
    });
    if (instUser?.staffMemberId) {
      staffMember = await prisma.staffMember.findFirst({ where: { id: instUser.staffMemberId, institutionId } });
    }
  } catch (err) {
    console.error('Error fetching staff member:', err);
  }

  // 3. Compile permissions array
  let permissions: string[] = [];
  let roleAssignments: Array<{ role: { nameAr: string; isSystem: boolean; isActive: boolean; archivedAt: Date | null } }> = [];
  let isAdmin = false;
  try {
    const instUser = await prisma.institutionUser.findFirst({
      where: { userId: user.id, institutionId, isActive: true, archivedAt: null },
      select: {
        id: true,
        roles: {
          where: { institutionId, role: { isActive: true, archivedAt: null } },
          select: { role: { select: { nameAr: true, isSystem: true, isActive: true, archivedAt: true } } },
        },
      },
    });
    roleAssignments = instUser?.roles || [];
    isAdmin = roleAssignments.some((assignment) => assignment.role.isSystem && assignment.role.isActive && !assignment.role.archivedAt);

    if (isAdmin) {
      // System roles get all active permission codes.
      const allPerms = await prisma.permission.findMany({ where: { isActive: true }, select: { module: true, action: true } });
        permissions = allPerms.map((permission) => `${permission.module}:${permission.action.toLowerCase()}`);
    } else if (instUser) {
        const assignedRoleIds = await prisma.institutionUserRole.findMany({
          where: { institutionUserId: instUser.id, institutionId, role: { isActive: true, archivedAt: null } },
          select: { roleId: true },
        });
        const ids = assignedRoleIds.map((role) => role.roleId);
        if (ids.length > 0) {
          // Query permissions associated with these roles
          const rolePerms = await prisma.rolePermission.findMany({
            where: { institutionId, roleId: { in: ids } },
            select: { permissionId: true },
          });
          
          if (rolePerms.length > 0) {
            const permIds = rolePerms.map((rolePermission) => rolePermission.permissionId);
            if (permIds.length > 0) {
              const activePerms = await prisma.permission.findMany({
                where: { isActive: true, id: { in: permIds } },
                select: { module: true, action: true },
              });
              permissions = activePerms.map((permission) => `${permission.module}:${permission.action.toLowerCase()}`);
            }
          }
        }
    }
  } catch (err) {
    console.error('Error fetching permissions:', err);
  }

  const displayName = user.displayName
    || (staffMember ? `${staffMember.firstNameAr} ${staffMember.familyNameAr}`.trim() : '')
    || user.email;

  return {
    user: {
      id: user.id,
      uid: user.id,
      email: user.email,
      displayName,
      role: isAdmin ? 'ADMIN' : (roleAssignments[0]?.role.nameAr || 'STAFF'),
      institutionId: user.institutionId,
      isActive: user.isActive,
      photoUrl: null
    },
    institutionId,
    academicYear: activeYear,
    staffMember,
    permissions
  };
}

export async function getAuthMe(req: ContextRequest, res: Response): Promise<any> {
  
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const email = req.user.email || 'user@school.edu';
  const authUser = req.user as AuthenticatedUser;
  const name = authUser.name || authUser.displayName || 'مستخدم النظام';
  const instId = req.context?.institutionId;

  const identity = await findAuthIdentityStateById(req.user.uid);
  const userRecord = identity?.isActive ? { ...identity, institutionUsers: await identityMemberships(identity.id) } : null;

  const membership = userRecord?.institutionUsers?.find((item: any) => item.institutionId === instId && item.isActive && !item.archivedAt)
    || userRecord?.institutionUsers?.find((item: any) => item.isActive && !item.archivedAt)
    || userRecord?.institutionUsers?.[0];
  if (!userRecord?.isPlatformAdmin && (!membership?.isActive || membership.archivedAt)) {
    return res.status(403).json({ error: 'The authenticated user is not assigned to an active institution.' });
  }
  if (!userRecord?.isPlatformAdmin && membership?.institution.archivedAt) {
    return res.status(403).json({ error: 'This institution is archived and unavailable for school operations.', code: 'INSTITUTION_ARCHIVED' });
  }

  const userContext = await buildUserContext(
    { ...userRecord, institutionId: membership?.institutionId || instId, displayName: name },
    membership?.institutionId || instId,
  );
  return res.json(userContext);

}

export async function createAuthLogin(req: ContextRequest, res: Response): Promise<any> {
  
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
  }

  const normEmail = String(email).trim().toLowerCase();

  // Local PostgreSQL/Prisma authentication is the only active login path.
  const identity = await findAuthIdentityByEmail(normEmail);
  const user = identity?.isActive ? identity : null;

  if (!user) {
    return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
  }

  // Check if account is active
  if (!user.isActive) {
    return res.status(403).json({ error: 'هذا الحساب مجمد أو موقوف مؤقتاً، يرجى مراجعة إدارة النظام' });
  }

  const membership = user.isPlatformAdmin ? null : (await identityMemberships(user.id)).find(m => m.isActive && !m.archivedAt);
  if (!membership && !user.isPlatformAdmin) {
    return res.status(403).json({ error: 'The authenticated user is not assigned to an active institution.' });
  }
  if (membership?.institution.archivedAt) {
    return res.status(403).json({ error: 'This institution is archived and unavailable for school operations.', code: 'INSTITUTION_ARCHIVED' });
  }
  if (user.mustChangePassword) {
    return res.status(403).json({ error: 'Account setup is required before sign in.', code: 'ACCOUNT_SETUP_REQUIRED' });
  }

  // Check lockout status
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    return res.status(423).json({ error: `الحساب مقفل مؤقتاً لكثرة المحاولات الخاطئة. حاول لاحقاً بعد: ${new Date(user.lockedUntil).toLocaleTimeString()}` });
  }

  // Hash & Check password
  const passwordValid = await verifyPassword(password, user.passwordHash);
  if (!passwordValid) {
    // Increment failed attempts
    const attempts = user.failedLoginAttempts + 1;
    let lockedUntil: Date | null = null;
    if (attempts >= 5) {
      lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 mins lock
    }
    
    await recordFailedLogin(user.id, attempts, lockedUntil);

    if (attempts >= 5) {
      return res.status(423).json({ error: 'تم قفل الحساب لمدة 15 دقيقة بسبب تكرار إدخال كلمة المرور بشكل خاطئ.' });
    }

    return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
  }

  if (isLegacyPasswordHash(user.passwordHash)) {
    await upgradePassword(normEmail, user.passwordHash, await hashPassword(password));
  }

  // Success login - reset failed attempts
  await recordSuccessfulLogin(user.id);

  const userContext = user.isPlatformAdmin
    ? await buildUserContext({ ...user, isPlatformAdmin: true })
    : await withRlsContext(membership!.institutionId, () => buildUserContext({ ...user, institutionId: membership!.institutionId }, membership!.institutionId));
  const sessionTokens = await createUserSession(user, req);
  setRefreshCookie(res, sessionTokens.refreshToken);
  return res.json({
    token: sessionTokens.token,
    accessToken: sessionTokens.token,
    message: 'تم تسجيل الدخو؄ بنجاح',
    user: {
      id: user.id,
      uid: user.id,
      email: user.email,
      displayName: user.email,
      role: userContext.user.role,
      photoUrl: null
    },
    context: userContext
  });


}

export async function refreshAuthSession(req: ContextRequest, res: Response): Promise<any> {
  if (!hasTrustedOrigin(req)) { clearRefreshCookie(res); return res.status(403).json({ error: 'The browser origin is not trusted.' }); }
  const refreshToken = readRefreshCookie(req);
  if (!refreshToken) { clearRefreshCookie(res); return res.status(401).json({ error: 'A refresh cookie is required.' }); }
  const oldHash = hashRefreshToken(refreshToken);
  const session = await authSessionByHash(oldHash);
  const now = new Date();
  const user = session ? await findAuthIdentityStateById(session.userId) : null;
  if (!session || session.revokedAt || session.expiresAt <= now || !user?.isActive || user.mustChangePassword || (user.lockedUntil && user.lockedUntil > now)) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'The refresh cookie is invalid or expired.' });
  }
  const membership = user.isPlatformAdmin ? null : (await identityMemberships(user.id)).find(m => m.isActive && !m.archivedAt);
  if (!membership && !user.isPlatformAdmin) { clearRefreshCookie(res); return res.status(403).json({ error: 'The authenticated user is not assigned to an active institution.' }); }
  if (membership?.institution.archivedAt) { clearRefreshCookie(res); return res.status(403).json({ error: 'This institution is archived and unavailable for school operations.', code: 'INSTITUTION_ARCHIVED' }); }
  const nextRefreshToken = createRefreshToken();
  const rotated = await rotateAuthSession(session.id, oldHash, hashRefreshToken(nextRefreshToken), refreshTokenExpiry(now));
  if (rotated !== 1) { clearRefreshCookie(res); return res.status(401).json({ error: 'The refresh cookie is no longer valid.' }); }
  const token = await createLocalAccessToken(user.id, user.email, user.securityStamp, session.id);
  setRefreshCookie(res, nextRefreshToken);
  return res.json({ token, accessToken: token });
}

export async function logoutAuthSession(req: AuthRequest, res: Response): Promise<any> {
  if (!hasTrustedOrigin(req)) return res.status(403).json({ error: 'The browser origin is not trusted.' });
  const refreshToken = readRefreshCookie(req);
  if (refreshToken) await revokeAuthSession(hashRefreshToken(refreshToken));
  clearRefreshCookie(res);
  return res.json({ message: 'Logged out successfully.' });
}

export async function logoutAllAuthSessions(req: AuthRequest, res: Response): Promise<any> {
  if (!req.user?.uid || !req.user.sid) return res.status(401).json({ error: 'Authentication is required.' });
  await invalidateUserSessions(req.user.sid!);
  clearRefreshCookie(res);
  return res.json({ message: 'All sessions were revoked.' });
}

export async function createAuthChangePassword(req: ContextRequest, res: Response): Promise<any> {
  const userId = req.user?.uid;
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  const confirmPassword = typeof req.body?.confirmPassword === 'string' ? req.body.confirmPassword : newPassword;
  if (!userId) return res.status(401).json({ error: 'Authentication is required.' });
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new passwords are required.' });
  if (newPassword !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match.', code: 'PASSWORD_CONFIRMATION_MISMATCH' });
  if (!validatePasswordPolicy(newPassword)) return res.status(400).json({ error: PASSWORD_POLICY_MESSAGE, code: 'PASSWORD_POLICY_VIOLATION' });

  if (!req.user?.sid) return res.status(401).json({ error: 'A current session is required.' });
  const state = await findAuthIdentityStateById(userId);
  const credentials = await passwordIdentity(req.user.sid);
  const user = state && credentials?.id === userId ? { ...state, passwordHash: credentials.passwordHash } : null;
  if (!user?.isActive || user.mustChangePassword) return res.status(403).json({ error: 'The account is not active.', code: 'ACCOUNT_NOT_ACTIVE' });
  if (!(await verifyPassword(currentPassword, user.passwordHash))) return res.status(401).json({ error: 'The current password is incorrect.', code: 'CURRENT_PASSWORD_INVALID' });
  if (await verifyPassword(newPassword, user.passwordHash)) return res.status(400).json({ error: 'The new password must differ from the current password.', code: 'PASSWORD_REUSE_NOT_ALLOWED' });

  const passwordHash = await hashPassword(newPassword);
  const membership = user.isPlatformAdmin ? null : (await identityMemberships(user.id)).find(m => m.isActive && !m.archivedAt);
  if (!user.isPlatformAdmin && !membership) return res.status(403).json({ error: 'The account is not assigned to an active institution.' });

  const changed = await changeOwnPassword(req.user.sid, user.passwordHash, passwordHash, membership?.institutionId || null);
  if (!changed) return res.status(401).json({ error: 'The current session or password is no longer valid.' });

  clearRefreshCookie(res);
  return res.json({ message: 'Password changed successfully. Sign in again.', sessionsRevoked: true });
}
