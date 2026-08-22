import type { PrismaClient } from '@prisma/client';
import { platformPrisma } from '../db/platform-prisma';
import { recordPlatformAuditEvent } from './platform-audit.service';
import { withPlatformInstitutionContext } from '../db/platform-institution-context';
import {
  createPendingAccountPasswordHash,
  issueAccountSetupToken,
  resolveAccountSetupStatus,
  setupDeliveryMetadata,
} from './account-setup.service';

const ACTIVE_SUBSCRIPTION_STATUSES = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'] as const;

async function getInitialAdmin(tx: any, institutionId: string) {
  return tx.institutionUser.findFirst({
    where: { institutionId, roles: { some: { role: { isSystem: true, archivedAt: null } } } },
    include: { user: true, staffMember: true, roles: { include: { role: true } } },
  });
}

async function ensureInitialAdminRole(tx: any, institutionId: string, actorUserId?: string) {
  let role = await tx.role.findFirst({ where: { institutionId, isSystem: true, archivedAt: null } });
  if (!role) {
    role = await tx.role.create({ data: { institutionId, nameAr: 'مدير المؤسسة', nameHe: null, isSystem: true, isActive: true, createdBy: actorUserId || null } });
  }
  const permissions = await tx.permission.findMany({ where: { isActive: true } });
  if (permissions.length) {
    await tx.rolePermission.createMany({ data: permissions.map((permission: any) => ({ institutionId, roleId: role.id, permissionId: permission.id, createdBy: actorUserId || null })), skipDuplicates: true });
  }
  return role;
}

export async function getInitialAdminStatus(institutionId: string, client: PrismaClient = platformPrisma) {
  return withPlatformInstitutionContext(institutionId, async (transaction) => {
    const admin = await getInitialAdmin(transaction, institutionId);
    if (!admin) return { hasInitialAdmin: false, status: 'NOT_PROVISIONED', admin: null, setup: null };
    const latest = await transaction.userAccountSetupToken.findFirst({ where: { userId: admin.userId }, orderBy: { createdAt: 'desc' } });
    const status = resolveAccountSetupStatus({
      userActive: admin.user.isActive,
      membershipActive: admin.isActive,
      membershipArchivedAt: admin.archivedAt,
      pendingSetup: admin.user.mustChangePassword,
      latestToken: latest,
    });
    return { hasInitialAdmin: true, status, admin: { id: admin.user.id, email: admin.user.email, displayName: `${admin.staffMember.firstNameAr} ${admin.staffMember.familyNameAr}`.trim(), isActive: admin.user.isActive, activatedAt: admin.user.mustChangePassword ? null : admin.user.updatedAt }, setup: latest ? { expiresAt: latest.expiresAt, usedAt: latest.usedAt } : null };
  }, client);
}

export async function provisionInitialSchoolAdmin(input: { institutionId: string; email: string; firstNameAr: string; familyNameAr: string; firstNameHe?: string; familyNameHe?: string; phoneNumber?: string; nationalId?: string; actorUserId?: string }) {
  const normalizedEmail = input.email.trim().toLowerCase();
  if (!normalizedEmail || !input.firstNameAr.trim() || !input.familyNameAr.trim()) throw Object.assign(new Error('Administrator email and required name fields are required.'), { statusCode: 400 });
  return withPlatformInstitutionContext(input.institutionId, async (tx) => {
    const institution = await tx.institution.findUnique({ where: { id: input.institutionId }, select: { id: true, nameAr: true, archivedAt: true } });
    if (!institution) throw Object.assign(new Error('Institution not found.'), { statusCode: 404 });
    if (institution.archivedAt) throw Object.assign(new Error('Archived institutions cannot receive an administrator setup link.'), { statusCode: 409, code: 'INSTITUTION_ARCHIVED' });
    const subscription = await tx.institutionSubscription.findFirst({ where: { institutionId: input.institutionId, status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] } }, orderBy: { startsAt: 'desc' } });
    if (!subscription) throw Object.assign(new Error('An active subscription is required before provisioning the initial administrator.'), { statusCode: 409 });
    if (await getInitialAdmin(tx, input.institutionId)) throw Object.assign(new Error('The initial administrator is already provisioned.'), { statusCode: 409 });

    const existingUser = await tx.user.findUnique({ where: { normalizedEmail }, include: { institutionUser: true } });
    if (existingUser?.isPlatformAdmin) throw Object.assign(new Error('This email belongs to a platform administrator.'), { statusCode: 409 });
    if (existingUser?.institutionUser) throw Object.assign(new Error('This email is already linked to a school account.'), { statusCode: 409 });

    if (existingUser) throw Object.assign(new Error('This email is already registered.'), { statusCode: 409 });
    const user = await tx.user.create({ data: { email: normalizedEmail, normalizedEmail, passwordHash: await createPendingAccountPasswordHash(), isActive: true, mustChangePassword: true } });
    const staffMember = await tx.staffMember.create({ data: { institutionId: input.institutionId, nationalId: input.nationalId || null, firstNameAr: input.firstNameAr.trim(), familyNameAr: input.familyNameAr.trim(), firstNameHe: input.firstNameHe || null, familyNameHe: input.familyNameHe || null, phoneNumber: input.phoneNumber || null, email: normalizedEmail } });
    const institutionUser = await tx.institutionUser.create({ data: { institutionId: input.institutionId, userId: user.id, staffMemberId: staffMember.id, isActive: true, createdBy: input.actorUserId || null } });
    const role = await ensureInitialAdminRole(tx, input.institutionId, input.actorUserId);
    await tx.institutionUserRole.create({ data: { institutionId: input.institutionId, institutionUserId: institutionUser.id, roleId: role.id, createdBy: input.actorUserId || null } });
    const token = await issueAccountSetupToken(tx, user.id);
    await recordPlatformAuditEvent({ actorUserId: input.actorUserId, action: 'INITIAL_ADMIN_PROVISIONED', entityType: 'InstitutionUser', entityId: institutionUser.id, targetInstitutionId: input.institutionId, metadata: { userId: user.id, staffMemberId: staffMember.id, email: normalizedEmail } }, tx);
    return { institutionId: input.institutionId, userId: user.id, institutionUserId: institutionUser.id, staffMemberId: staffMember.id, email: normalizedEmail, setup: setupDeliveryMetadata(token) };
  });
}

export async function reissueInitialAdminSetup(input: { institutionId: string; actorUserId?: string }) {
  return withPlatformInstitutionContext(input.institutionId, async (tx) => {
    const institution = await tx.institution.findUnique({ where: { id: input.institutionId }, select: { archivedAt: true } });
    if (institution?.archivedAt) throw Object.assign(new Error('Archived institutions cannot receive an administrator setup link.'), { statusCode: 409, code: 'INSTITUTION_ARCHIVED' });
    const admin = await getInitialAdmin(tx, input.institutionId);
    if (!admin) throw Object.assign(new Error('The initial administrator has not been provisioned.'), { statusCode: 404 });
    if (!admin.user.isActive || !admin.isActive || admin.archivedAt) throw Object.assign(new Error('The initial administrator account is disabled.'), { statusCode: 409 });
    if (!admin.user.mustChangePassword) throw Object.assign(new Error('The initial administrator account is already active.'), { statusCode: 409 });
    const token = await issueAccountSetupToken(tx, admin.userId);
    await recordPlatformAuditEvent({ actorUserId: input.actorUserId, action: 'ACCOUNT_SETUP_REISSUED', entityType: 'InstitutionUser', entityId: admin.id, targetInstitutionId: input.institutionId, metadata: { userId: admin.userId } }, tx);
    return { institutionId: input.institutionId, email: admin.user.email, setup: setupDeliveryMetadata(token) };
  });
}

export async function revokeInitialAdminSetup(input: { institutionId: string; actorUserId?: string }) {
  return withPlatformInstitutionContext(input.institutionId, async (tx) => {
    const institution = await tx.institution.findUnique({ where: { id: input.institutionId }, select: { archivedAt: true } });
    if (institution?.archivedAt) throw Object.assign(new Error('Archived institutions cannot receive administrator setup changes.'), { statusCode: 409, code: 'INSTITUTION_ARCHIVED' });
    const admin = await getInitialAdmin(tx, input.institutionId);
    if (!admin) throw Object.assign(new Error('The initial administrator has not been provisioned.'), { statusCode: 404 });
    if (!admin.user.mustChangePassword) throw Object.assign(new Error('The initial administrator account is already active.'), { statusCode: 409 });
    const revokedAt = new Date();
    const result = await tx.userAccountSetupToken.updateMany({ where: { userId: admin.userId, usedAt: null }, data: { usedAt: revokedAt } });
    await recordPlatformAuditEvent({ actorUserId: input.actorUserId, action: 'ACCOUNT_SETUP_REVOKED', entityType: 'InstitutionUser', entityId: admin.id, targetInstitutionId: input.institutionId, metadata: { userId: admin.userId, revokedCount: result.count } }, tx);
    return { institutionId: input.institutionId, revokedAt, revokedCount: result.count };
  });
}
