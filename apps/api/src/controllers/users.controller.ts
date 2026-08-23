import { Response } from 'express';
import { ContextRequest } from '../middleware/context';
import crypto from 'node:crypto';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../db/prisma';
import { invalidateUserSessions } from './auth.controller';
import { buildUserContext } from './auth.controller';
import { recordAuditEvent } from '../services/audit.service';
import {
  createPendingAccountPasswordHash,
  issueAccountSetupToken,
  resolveAccountSetupStatus,
  setupDeliveryMetadata,
} from '../services/account-setup.service';

export async function ensureRolesAndPermissionsSeeded(instId: string) {
  
  const existingPerms = await prisma.permission.findMany();
  if (existingPerms.length === 0) {
    throw new Error('System permissions have not been bootstrapped. Run the production bootstrap before serving school requests.');
  }
  if (false) {
    const permsToInsert = [
      { code: 'students:create', module: 'students', action: 'CREATE', nameAr: '״¥״¶״§״© ״·״§„״¨', nameHe: '׳”׳•׳¡׳₪׳× ׳×׳׳׳™׳“', descriptionAr: '״§„״³…״§״­ ״¨״¥״¶״§״© ״·„״§״¨ ״¬״¯״¯ „„†״¸״§…', descriptionHe: '׳”׳¨׳©׳׳” ׳׳”׳•׳¡׳™׳£ ׳×׳׳׳™׳“׳™׳ ׳—׳“׳©׳™׳' },
      { code: 'students:read', module: 'students', action: 'READ', nameAr: '״¹״±״¶ ״§„״·„״§״¨', nameHe: '׳¦׳₪׳™׳™׳” ׳‘׳×׳׳׳™׳“׳™׳', descriptionAr: '״§„״³…״§״­ ״¨״§״³״×״¹״±״§״¶ ‚ˆ״§״¦… ˆ״¦״§״× ״§„״·„״§״¨', descriptionHe: '׳”׳¨׳©׳׳” ׳׳¦׳₪׳•׳× ׳‘׳¨׳©׳™׳׳•׳× ׳×׳׳׳™׳“׳™׳' },
      { code: 'students:update', module: 'students', action: 'UPDATE', nameAr: '״×״¹״¯„ ״·״§„״¨', nameHe: '׳¢׳¨׳™׳›׳× ׳×׳׳׳™׳“', descriptionAr: '״§„״³…״§״­ ״¨״×״¹״¯„ ״¨״§†״§״× ״§„״·„״§״¨ ״§„״­״§„״©', descriptionHe: '׳”׳¨׳©׳׳” ׳׳¢׳¨׳•׳ ׳₪׳¨׳˜׳™ ׳×׳׳׳™׳“׳™׳' },
      { code: 'students:delete', module: 'students', action: 'DELETE', nameAr: '״­״° ״·״§„״¨', nameHe: '׳׳—׳™׳§׳× ׳×׳׳׳™׳“', descriptionAr: '״§„״³…״§״­ ״¨״­״° ״£ˆ ״£״±״´״© ״§„״·„״§״¨', descriptionHe: '׳”׳¨׳©׳׳” ׳׳׳—׳•׳§ ׳׳• ׳׳׳¨׳›׳‘ ׳×׳׳׳™׳“׳™׳' },

      { code: 'teachers:create', module: 'teachers', action: 'CREATE', nameAr: '״¥״¶״§״© …ˆ״¸', nameHe: '׳”׳•׳¡׳₪׳× ׳׳™׳© ׳¦׳•׳•׳×', descriptionAr: '״§„״³…״§״­ ״¨״¥״¯״®״§„ …ˆ״¸† ״¬״¯״¯ „„ƒ״§״¯״±', descriptionHe: '׳”׳¨׳©׳׳” ׳׳”׳•׳¡׳™׳£ ׳׳ ׳©׳™ ׳¦׳•׳•׳×' },
      { code: 'teachers:read', module: 'teachers', action: 'READ', nameAr: '״¹״±״¶ ״§„ƒ״§״¯״± ˆ״§„״×״¹†״§״×', nameHe: '׳¦׳₪׳™׳™׳” ׳‘׳׳ ׳©׳™ ׳¦׳•׳•׳×', descriptionAr: '״§„״³…״§״­ ״¨…״·״§„״¹״© ״¨״§†״§״× ˆ״×״¹†״§״× ״§„…״¹„…† ˆ״§„…ˆ״¸†', descriptionHe: '׳”׳¨׳©׳׳” ׳׳¦׳₪׳•׳× ׳‘׳₪׳¨׳˜׳™ ׳׳ ׳©׳™ ׳¦׳•׳•׳×' },
      { code: 'teachers:update', module: 'teachers', action: 'UPDATE', nameAr: '״×״¹״¯„ …ˆ״¸', nameHe: '׳¢׳¨׳™׳›׳× ׳׳™׳© ׳¦׳•׳•׳×', descriptionAr: '״§„״³…״§״­ ״¨״×״­״¯״« ״×״¹†״§״× ˆ…„״§״× ״§„…״¹„…†', descriptionHe: '׳”׳¨׳©׳׳” ׳׳¢׳“׳›׳ ׳₪׳¨׳˜׳™ ׳׳ ׳©׳™ ׳¦׳•׳•׳×' },
      { code: 'teachers:delete', module: 'teachers', action: 'DELETE', nameAr: '״­״° …ˆ״¸', nameHe: '׳׳—׳™׳§׳× ׳׳™׳© ׳¦׳•׳•׳×', descriptionAr: '״§„״³…״§״­ ״¨״­״° …ˆ״¸ …† ״§„†״¸״§… ״§„ƒ„', descriptionHe: '׳”׳¨׳©׳׳” ׳׳׳—׳•׳§ ׳׳ ׳©׳™ ׳¦׳•׳•׳×' },

      { code: 'exams:create', module: 'exams', action: 'CREATE', nameAr: '״¥†״´״§״¡ ״§…״×״­״§†', nameHe: '׳™׳¦׳™׳¨׳× ׳׳‘׳—׳', descriptionAr: '״§„״³…״§״­ ״¨״¥״¹״¯״§״¯ ״§…״×״­״§†״§״× ״¬״¯״¯״© ˆ״×ˆ״²״¹ ״¹„״§…״§״× ״§„״£״³״¦„״©', descriptionHe: '׳”׳¨׳©׳׳” ׳׳™׳¦׳•׳¨ ׳׳‘׳—׳ ׳™׳ ׳—׳“׳©׳™׳' },
      { code: 'exams:read', module: 'exams', action: 'READ', nameAr: '״¹״±״¶ ״§„״§…״×״­״§†״§״× ˆ״§„†״×״§״¦״¬', nameHe: '׳¦׳₪׳™׳™׳” ׳‘׳׳‘׳—׳ ׳™׳ ׳•׳¦׳™׳•׳ ׳™׳', descriptionAr: '״§„״³…״§״­ ״¨…״´״§‡״¯״© ״§„״§…״×״­״§†״§״× ״§„״­״§„״© ˆ״±״µ״¯ †״×״§״¦״¬‡״§', descriptionHe: '׳”׳¨׳©׳׳” ׳׳¦׳₪׳•׳× ׳‘׳׳‘׳—׳ ׳™׳ ׳•׳‘׳¦׳™׳•׳ ׳™׳' },
      { code: 'exams:update', module: 'exams', action: 'UPDATE', nameAr: '״×״¹״¯„ ״¹„״§…״§״× ״§„״§…״×״­״§†', nameHe: '׳¢׳“׳›׳•׳ ׳¦׳™׳•׳ ׳™ ׳׳‘׳—׳', descriptionAr: '״§„״³…״§״­ ״¨״×״­״¯״« ״¯״±״¬״§״× ״§„״£״³״¦„״© ˆ״¹„״§…״§״× ״§„״·„״§״¨', descriptionHe: '׳”׳¨׳©׳׳” ׳׳¢׳“׳›׳ ׳¦׳™׳•׳ ׳™׳' },
      { code: 'exams:delete', module: 'exams', action: 'DELETE', nameAr: '״¥„״÷״§״¡ ״§…״×״­״§†', nameHe: '׳‘׳™׳˜׳•׳ ׳׳‘׳—׳', descriptionAr: '״§„״³…״§״­ ״¨״­״° ״£ˆ ״¥״¨״·״§„ ״§…״×״­״§†״§״× †״´״·״©', descriptionHe: '׳”׳¨׳©׳׳” ׳׳‘׳˜׳ ׳׳‘׳—׳ ׳™׳' },

      { code: 'settings:create', module: 'settings', action: 'CREATE', nameAr: '״×״­״¯״« ״¥״¹״¯״§״¯״§״× ״§„†״¸״§…', nameHe: '׳¢׳“׳›׳•׳ ׳”׳’׳“׳¨׳•׳× ׳׳¢׳¨׳›׳×', descriptionAr: '״§„״³…״§״­ ״¨״×״¹״¯„ ״§„…״×״÷״±״§״× ״§„״£״³״§״³״© „„…״₪״³״³״© ˆ״§„…״¸‡״±', descriptionHe: '׳”׳¨׳©׳׳” ׳׳¢׳“׳›׳ ׳”׳’׳“׳¨׳•׳× ׳׳¢׳¨׳›׳×' },
      { code: 'settings:read', module: 'settings', action: 'READ', nameAr: '״¹״±״¶ ״§„״¥״¹״¯״§״¯״§״× ˆ״§„״¬״¯״§ˆ„', nameHe: '׳¦׳₪׳™׳™׳” ׳‘׳”׳’׳“׳¨׳•׳×', descriptionAr: '״§„״³…״§״­ ״¨…״·״§„״¹״© ״§„״¥״¹״¯״§״¯״§״× ˆ״§„״¬״¯״§ˆ„ ״§„…״±״¬״¹״© ˆ…ƒ״¹״¨ ״§„״¨״§†״§״×', descriptionHe: '׳”׳¨׳©׳׳” ׳׳¦׳₪׳•׳× ׳‘׳”׳’׳“׳¨׳•׳× ׳׳¢׳¨׳›׳×' },
    ];
    const permissionRows = permsToInsert.map(({ code: _code, descriptionAr: _descriptionAr, descriptionHe: _descriptionHe, ...permission }) => permission);
    void permissionRows;
  }

  const subscriptionPermission = await prisma.permission.findUnique({
    where: { module_action: { module: 'subscription', action: 'READ' } },
  });
  const seededRoles = await prisma.role.findMany({ where: { institutionId: instId, isActive: true } });
  const attendancePerms = await prisma.permission.findMany({ where: { module: 'attendance' } });
  const adminRole = seededRoles.find((role) => role.isSystem);
  const settingsUpdatePermission = await prisma.permission.findUnique({
    where: { module_action: { module: 'settings', action: 'UPDATE' } },
  });
  if (adminRole && settingsUpdatePermission) {
    await prisma.rolePermission.createMany({
      data: [{ institutionId: instId, roleId: adminRole.id, permissionId: settingsUpdatePermission.id }],
      skipDuplicates: true,
    });
  }
  if (adminRole && attendancePerms.length > 0) {
    await prisma.rolePermission.createMany({
      data: attendancePerms.map((permission) => ({ institutionId: instId, roleId: adminRole.id, permissionId: permission.id })),
      skipDuplicates: true,
    });
  }
  if (adminRole && subscriptionPermission) {
    await prisma.rolePermission.createMany({
      data: [{ institutionId: instId, roleId: adminRole.id, permissionId: subscriptionPermission.id }],
      skipDuplicates: true,
    });
  }
  const teacherRole = seededRoles.find((role) => !role.isSystem);
  const attendanceRead = attendancePerms.filter((permission) => permission.action === 'READ');
  if (teacherRole && attendanceRead.length > 0) {
    await prisma.rolePermission.createMany({
      data: attendanceRead.map((permission) => ({ institutionId: instId, roleId: teacherRole.id, permissionId: permission.id })),
      skipDuplicates: true,
    });
  }

  const lifecyclePerms = await prisma.permission.findMany({ where: { module: { in: ['guardian', 'medical-profile'] } } });
  if (adminRole && lifecyclePerms.length > 0) {
    await prisma.rolePermission.createMany({
      data: lifecyclePerms.map((permission) => ({ institutionId: instId, roleId: adminRole.id, permissionId: permission.id })),
      skipDuplicates: true,
    });
  }
  if (teacherRole && lifecyclePerms.length > 0) {
    await prisma.rolePermission.createMany({
      data: lifecyclePerms.filter((permission) => permission.action === 'READ').map((permission) => ({ institutionId: instId, roleId: teacherRole.id, permissionId: permission.id })),
      skipDuplicates: true,
    });
  }

  const existingRoles = await prisma.role.findMany({ where: { institutionId: instId } });
  if (existingRoles.length === 0) {
    // Create admin, manager, and teacher roles
    const roleRows = [
      {
        institutionId: instId,
        code: 'ADMIN',
        nameAr: '…״¯״± ״§„†״¸״§… ״§„ƒ״§…„',
        nameHe: '׳׳ ׳”׳ ׳׳¢׳¨׳›׳× ׳¨׳׳©׳™',
        descriptionAr: '…״×„ƒ ƒ״§…„ ״§„״µ„״§״­״§״× „״¥״¯״§״±״© ״§„״­״³״§״¨״§״×״ ״§„״¥״¹״¯״§״¯״§״×״ ˆ״§„״¨״§†״§״× ״§„״­ˆ״© ״¨״§„…״¯״±״³״©',
        descriptionHe: '׳‘׳¢׳ ׳”׳¨׳©׳׳•׳× ׳׳׳׳•׳× ׳׳ ׳™׳”׳•׳ ׳׳©׳×׳׳©׳™׳ ׳•׳”׳’׳“׳¨׳•׳×',
        isSystem: true,
        isActive: true
      },
      {
        institutionId: instId,
        code: 'TEACHER',
        nameAr: '…״¹„… ˆ…״±״¨ ״µ',
        nameHe: '׳׳•׳¨׳” ׳•׳׳—׳ ׳ ׳›׳™׳×׳”',
        descriptionAr: '״µ„״§״­״§״× ״±״µ״¯ ״¹„״§…״§״× ״§„״·„״§״¨״ ״¥״¯״§״±״© …״¬…ˆ״¹״§״× ״§„״¯״±״§״³״© ˆ״§„״§…״×״­״§†״§״×',
        descriptionHe: '׳”׳¨׳©׳׳” ׳׳”׳–׳ ׳× ׳¦׳™׳•׳ ׳™׳ ׳•׳ ׳™׳”׳•׳ ׳§׳‘׳•׳¦׳•׳× ׳׳™׳׳•׳“ ׳•׳׳‘׳—׳ ׳™׳',
        isSystem: false,
        isActive: true
      }
    ];
    await prisma.role.createMany({ data: roleRows.map(({ code: _code, descriptionAr: _descriptionAr, descriptionHe: _descriptionHe, ...role }) => role) });
    const insertedRoles = await prisma.role.findMany({ where: { institutionId: instId } });

    // map all permissions to ADMIN role
    const allPerms = await prisma.permission.findMany();
    const adminRole = insertedRoles.find(r => r.isSystem);
    if (adminRole) {
      const rolePermValues = allPerms.map(p => ({
        institutionId: instId,
        roleId: adminRole.id,
        permissionId: p.id
      }));
      await prisma.rolePermission.createMany({ data: rolePermValues });
    }

    // map only read and update to TEACHER role
    const teacherRole = insertedRoles.find(r => !r.isSystem);
    if (teacherRole) {
      const teacherPerms = allPerms.filter(p => p.action === 'READ' || p.module === 'exams');
      if (teacherPerms.length > 0) {
        const rolePermValues = teacherPerms.map(p => ({
          institutionId: instId,
          roleId: teacherRole.id,
          permissionId: p.id
        }));
        await prisma.rolePermission.createMany({ data: rolePermValues });
      }
    }
  }

}

export async function getPermissions(req: ContextRequest, res: Response): Promise<any> {
  
  const instId = req.context?.institutionId || '';
  await ensureRolesAndPermissionsSeeded(instId);
  const perms = await prisma.permission.findMany({ where: { isActive: true }, orderBy: [{ module: 'asc' }, { action: 'asc' }] });
  return res.json(perms.map((permission) => ({ ...permission, code: `${permission.module}:${permission.action.toLowerCase()}` })));

}

export async function getRoles(req: ContextRequest, res: Response): Promise<any> {
  
  const instId = req.context?.institutionId || '';
  await ensureRolesAndPermissionsSeeded(instId);

  const rolesList = await prisma.role.findMany({ where: { institutionId: instId }, orderBy: { nameAr: 'asc' } });

  // For each role, fetch linked permission IDs
  const rolesWithPerms = await Promise.all(rolesList.map(async (role) => {
    const linked = await prisma.rolePermission.findMany({ where: { roleId: role.id, institutionId: instId }, select: { permissionId: true } });

    return {
      ...role,
      code: role.id,
      permissionIds: linked.map(l => l.permissionId)
    };
  }));

  return res.json(rolesWithPerms);

}

export async function createRoles(req: ContextRequest, res: Response): Promise<any> {
  
  const instId = req.context?.institutionId || '';
  const { nameAr, nameHe, isActive, permissionIds } = req.body;

  if (!nameAr) {
    return res.status(400).json({ error: 'اسم الدور مطلوب' });
  }

  const normalizedPermissionIds = Array.isArray(permissionIds) ? [...new Set(permissionIds.map(String))] : [];
  if (normalizedPermissionIds.length) {
    const permissionCount = await prisma.permission.count({ where: { id: { in: normalizedPermissionIds } } });
    if (permissionCount !== normalizedPermissionIds.length) return res.status(400).json({ error: 'توجد صلاحية غير صالحة.' });
  }

  const newRole = await prisma.role.create({ data: {
    institutionId: instId,
    nameAr: nameAr,
    nameHe: nameHe || null,
    isActive: isActive === undefined ? true : isActive,
    isSystem: false,
  } });

  // Bulk insert role-permissions mapping
  if (normalizedPermissionIds.length > 0) {
    const mappings = normalizedPermissionIds.map(pId => ({
      institutionId: instId,
      roleId: newRole.id,
      permissionId: pId
    }));
    await prisma.rolePermission.createMany({ data: mappings });
  }

  return res.json({ ...newRole, code: newRole.id, permissionIds: normalizedPermissionIds });

}

export async function updateRolesById(req: ContextRequest, res: Response): Promise<any> {
  
  const instId = req.context?.institutionId || '';
  const roleId = String(req.params['id']);
  const { nameAr, nameHe, isActive, permissionIds } = req.body;

  const existing = await prisma.role.findFirst({ where: { id: roleId, institutionId: instId } });

  if (!existing) {
    return res.status(404).json({ error: '״§„״¯ˆ״± ״§„…״·„ˆ״¨ ״÷״± …ˆ״¬ˆ״¯' });
  }

  if (existing.isSystem) {
    return res.status(400).json({ error: 'System roles cannot be edited.' });
  }

  const normalizedPermissionIds = Array.isArray(permissionIds) ? [...new Set(permissionIds.map(String))] : [];
  if (normalizedPermissionIds.length) {
    const permissionCount = await prisma.permission.count({ where: { id: { in: normalizedPermissionIds } } });
    if (permissionCount !== normalizedPermissionIds.length) return res.status(400).json({ error: 'توجد صلاحية غير صالحة.' });
  }

  // Update role metadata
  const updated = await prisma.$transaction(async (tx) => {
    const role = await tx.role.update({ where: { id: roleId }, data: {
      nameAr,
      nameHe: nameHe || null,
      isActive: isActive === undefined ? true : isActive,
      archivedAt: isActive === false ? new Date() : null,
      updatedAt: new Date()
    } });
    await tx.rolePermission.deleteMany({ where: { roleId, institutionId: instId } });
    if (normalizedPermissionIds.length > 0) {
      await tx.rolePermission.createMany({ data: normalizedPermissionIds.map((permissionId) => ({ institutionId: instId, roleId, permissionId })) });
    }
    await recordAuditEvent(tx, { institutionId: instId, actorUserId: req.user?.uid, action: 'ROLE_UPDATED', entityType: 'Role', entityId: roleId, metadata: { permissionCount: normalizedPermissionIds.length } });
    return role;
  });

  return res.json({ ...updated, code: updated.id, permissionIds: normalizedPermissionIds });

}

export async function deleteRolesById(req: ContextRequest, res: Response): Promise<any> {
  
  const instId = req.context?.institutionId || '';
  const roleId = String(req.params['id']);

  const existing = await prisma.role.findFirst({ where: { id: roleId, institutionId: instId } });

  if (!existing) {
    return res.status(404).json({ error: '״§„״¯ˆ״± ״÷״± …ˆ״¬ˆ״¯' });
  }

  if (existing.isSystem) {
    return res.status(400).json({ error: '״¹״°״±״§‹״ „״§ …ƒ† ״­״° ״§„״£״¯ˆ״§״± ״§„†״¸״§…״© ״§„…״¯…״¬״©' });
  }

  await prisma.$transaction(async (tx) => {
    await tx.role.update({ where: { id: roleId }, data: { isActive: false, archivedAt: new Date(), updatedAt: new Date() } });
    await recordAuditEvent(tx, { institutionId: instId, actorUserId: req.user?.uid, action: 'ROLE_ARCHIVED', entityType: 'Role', entityId: roleId });
  });

  return res.json({ message: 'Role archived successfully', id: roleId });

}

export async function getStaffMembersUnregistered(req: ContextRequest, res: Response): Promise<any> {
  
  const instId = req.context?.institutionId || '';

  // Fetch all staff members
  const allStaff = await prisma.staffMember.findMany({ where: { institutionId: instId } });

  // Fetch registered institution users staff ids
  const registered = await prisma.institutionUser.findMany({ where: { institutionId: instId }, select: { staffMemberId: true } });

  const registeredIds = new Set(registered.map(r => r.staffMemberId));

  // Filter to get unregistered staff members
  const unregistered = allStaff.filter(s => !registeredIds.has(s.id));
  return res.json(unregistered);

}

export async function getInstitutionUsers(req: ContextRequest, res: Response): Promise<any> {
  
  const instId = req.context?.institutionId || '';
  await ensureRolesAndPermissionsSeeded(instId);

  const list = await prisma.institutionUser.findMany({ where: { institutionId: instId } });
  const userIds = list.map((item) => item.userId);
  const staffIds = list.map((item) => item.staffMemberId);
  const [users, staffMembers, setupTokens] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, mustChangePassword: true, isActive: true } }),
    prisma.staffMember.findMany({ where: { id: { in: staffIds } }, select: { id: true, firstNameAr: true, familyNameAr: true, nationalId: true } }),
    prisma.userAccountSetupToken.findMany({ where: { userId: { in: userIds } }, orderBy: { createdAt: 'desc' }, select: { userId: true, expiresAt: true, usedAt: true } }),
  ]);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const staffById = new Map(staffMembers.map((staff) => [staff.id, staff]));
  const latestSetupByUserId = new Map<string, { expiresAt: Date; usedAt: Date | null }>();
  for (const token of setupTokens) if (!latestSetupByUserId.has(token.userId)) latestSetupByUserId.set(token.userId, token);

  // Fetch roles for each institution user
  const listWithRoles = await Promise.all(list.map(async (instUser) => {
    const assignments = await prisma.institutionUserRole.findMany({ where: { institutionUserId: instUser.id, institutionId: instId }, select: { roleId: true } });
    const roles = await prisma.role.findMany({ where: { id: { in: assignments.map((assignment) => assignment.roleId) }, institutionId: instId }, select: { id: true, nameAr: true, nameHe: true } });

    const accountUser = usersById.get(instUser.userId);
    const latestSetup = latestSetupByUserId.get(instUser.userId);
    const accountStatus = resolveAccountSetupStatus({
      userActive: Boolean(accountUser?.isActive),
      membershipActive: instUser.isActive,
      membershipArchivedAt: instUser.archivedAt,
      pendingSetup: Boolean(accountUser?.mustChangePassword),
      latestToken: latestSetup,
    });
    return {
      ...instUser,
      user: accountUser ? { id: accountUser.id, email: accountUser.email, isActive: accountUser.isActive } : undefined,
      staffMember: staffById.get(instUser.staffMemberId),
      accountStatus,
      setup: latestSetup ? { expiresAt: latestSetup.expiresAt } : null,
      roles: assignments.map((assignment) => {
        const role = roles.find((item) => item.id === assignment.roleId);
        return { roleId: assignment.roleId, roleNameAr: role?.nameAr, roleNameHe: role?.nameHe, roleCode: role?.id };
      }),
    };
  }));

  return res.json(listWithRoles);

}

export async function createInstitutionUsers(req: ContextRequest, res: Response): Promise<any> {
  const instId = req.context?.institutionId || '';
  const { staffMemberId, email, password, roleIds } = req.body;

  if (!staffMemberId || !email) {
    return res.status(400).json({ error: '״¬…״¹ ״­‚ˆ„ ״¥†״´״§״¡ ״§„…״³״×״®״¯… …״·„ˆ״¨״©' });
  }
  if (password !== undefined) {
    return res.status(400).json({ error: 'Temporary passwords are not accepted. The user must complete account setup.', code: 'TEMPORARY_PASSWORD_NOT_ALLOWED' });
  }

  const staff = await prisma.staffMember.findFirst({ where: { id: staffMemberId, institutionId: instId } });
  if (!staff) {
    return res.status(404).json({ error: '״§„…ˆ״¸ ״§„…״­״¯״¯ ״÷״± …ˆ״¬ˆ״¯' });
  }

  const displayName = `${staff.firstNameAr} ${staff.familyNameAr}`;
  const normEmail = String(email).trim().toLowerCase();
  const existing = await prisma.user.findFirst({ where: { normalizedEmail: normEmail }, include: { institutionUsers: { where: { institutionId: instId }, select: { id: true } } } });
  if (existing?.isPlatformAdmin) {
    return res.status(409).json({ error: 'Platform administrator accounts cannot be assigned as school users.' });
  }
  if (existing?.institutionUsers.length) {
    return res.status(409).json({ error: 'This email is already linked to this school account.' });
  }

  const normalizedRoleIds = Array.isArray(roleIds) ? [...new Set(roleIds.map(String))] : [];
  if (normalizedRoleIds.length > 0) {
    const roleCount = await prisma.role.count({ where: { id: { in: normalizedRoleIds }, institutionId: instId, isActive: true } });
    if (roleCount !== normalizedRoleIds.length) return res.status(400).json({ error: 'يوجد دور غير صالح لهذه المؤسسة.' });
  }

  const created = await prisma.$transaction(async (tx) => {
    const newUser = existing || await tx.user.create({ data: {
      email: normEmail,
      normalizedEmail: normEmail,
      passwordHash: await createPendingAccountPasswordHash(),
      securityStamp: crypto.randomUUID(),
      isActive: true,
      mustChangePassword: true,
    } });
    const newInstUser = await tx.institutionUser.create({ data: {
      institutionId: instId,
      userId: newUser.id,
      staffMemberId,
      isActive: true,
      createdBy: req.user?.uid || null,
    } });
    if (normalizedRoleIds.length > 0) {
      await tx.institutionUserRole.createMany({ data: normalizedRoleIds.map((roleId) => ({
        institutionId: instId,
        institutionUserId: newInstUser.id,
        roleId,
        createdBy: req.user?.uid || null,
      })) });
    }
    const setup = newUser.mustChangePassword ? await issueAccountSetupToken(tx, newUser.id) : null;
    await recordAuditEvent(tx, { institutionId: instId, actorUserId: req.user?.uid, action: 'USER_CREATED', entityType: 'InstitutionUser', entityId: newInstUser.id, metadata: { userId: newUser.id, email: normEmail } });
    if (setup) await recordAuditEvent(tx, { institutionId: instId, actorUserId: req.user?.uid, action: 'ACCOUNT_SETUP_ISSUED', entityType: 'InstitutionUser', entityId: newInstUser.id, metadata: { userId: newUser.id, expiresAt: setup.expiresAt.toISOString() } });
    if (normalizedRoleIds.length > 0) {
      await recordAuditEvent(tx, { institutionId: instId, actorUserId: req.user?.uid, action: 'ROLE_ASSIGN', entityType: 'InstitutionUser', entityId: newInstUser.id, metadata: { roleCount: normalizedRoleIds.length } });
    }
    return { newUser, newInstUser, setup };
  });

  return res.status(201).json({
    message: 'User created. Account setup is required.',
    id: created.newInstUser.id,
    userId: created.newUser.id,
    displayName,
    accountStatus: created.newUser.mustChangePassword ? 'PENDING_SETUP' : 'ACTIVE',
    setup: created.setup ? setupDeliveryMetadata(created.setup) : null,
  });
}

export async function patchInstitutionUsersById(req: ContextRequest, res: Response): Promise<any> {
  
  const instId = req.context?.institutionId || '';
  const instUserId = req.params['id'] as string;
  const { isActive, password, roleIds } = req.body;

  const instUser = await prisma.institutionUser.findFirst({ where: { id: instUserId, institutionId: instId } });

  if (!instUser) {
    return res.status(404).json({ error: '״§„״­״³״§״¨ ״§„…״·„ˆ״¨ ״÷״± …ˆ״¬ˆ״¯' });
  }
  if (password !== undefined) {
    return res.status(400).json({ error: 'Password changes are not allowed through school user administration.', code: 'TEMPORARY_PASSWORD_NOT_ALLOWED' });
  }

  const targetUserId = instUser.userId;

  if (req.user?.uid === targetUserId && isActive === false) {
    return res.status(400).json({ error: 'You cannot disable your own institution membership.', code: 'SELF_LOCKOUT_PREVENTED' });
  }

  const normalizedRoleIds = roleIds && Array.isArray(roleIds) ? [...new Set(roleIds.map(String))] : null;
  if (normalizedRoleIds) {
    const roleCount = await prisma.role.count({ where: { id: { in: normalizedRoleIds }, institutionId: instId, isActive: true, archivedAt: null } });
    if (roleCount !== normalizedRoleIds.length) return res.status(400).json({ error: 'يوجد دور غير صالح لهذه المؤسسة.' });
    if (req.user?.uid === targetUserId) {
      const currentSystemRole = await prisma.institutionUserRole.findFirst({ where: { institutionId: instId, institutionUserId: instUserId, role: { isSystem: true, isActive: true, archivedAt: null } }, select: { roleId: true } });
      if (currentSystemRole && !normalizedRoleIds.includes(currentSystemRole.roleId)) {
        return res.status(400).json({ error: 'You cannot remove your own administrator role.', code: 'SELF_LOCKOUT_PREVENTED' });
      }
    }
  }

  // Toggle active state if passed
  if (isActive !== undefined) {
    await prisma.institutionUser.update({ where: { id: instUserId }, data: { isActive, updatedAt: new Date() } });
    if (!isActive) await invalidateUserSessions(targetUserId);
    await recordAuditEvent(prisma, { institutionId: instId, actorUserId: req.user?.uid, action: isActive ? 'USER_ENABLED' : 'USER_DISABLED', entityType: 'InstitutionUser', entityId: instUserId, metadata: { userId: targetUserId } });
  }

  // Update Role IDs if passed
  if (normalizedRoleIds) {
    await prisma.$transaction(async (tx) => {
      await tx.institutionUserRole.deleteMany({ where: { institutionUserId: instUserId, institutionId: instId } });
      if (normalizedRoleIds.length > 0) {
        await tx.institutionUserRole.createMany({ data: normalizedRoleIds.map((roleId) => ({ institutionId: instId, institutionUserId: instUserId, roleId })) });
      }
      await recordAuditEvent(tx, { institutionId: instId, actorUserId: req.user?.uid, action: 'ROLE_ASSIGN', entityType: 'InstitutionUser', entityId: instUserId, metadata: { roleCount: normalizedRoleIds.length } });
    });
  }

  return res.json({ message: '״×… ״×״­״¯״« ״¨״§†״§״× ״§„…״³״×״®״¯… ˆ״µ„״§״­״§״×‡ ״¨†״¬״§״­' });

}

export async function reissueInstitutionUserSetup(req: ContextRequest, res: Response): Promise<any> {
  const instId = req.context?.institutionId || '';
  const instUserId = String(req.params['id'] || '');
  try {
    const result = await prisma.$transaction(async (tx) => {
      const instUser = await tx.institutionUser.findFirst({
        where: { id: instUserId, institutionId: instId },
        include: { user: true },
      });
      if (!instUser) throw Object.assign(new Error('Institution user not found.'), { statusCode: 404, code: 'INSTITUTION_USER_NOT_FOUND' });
      if (!instUser.isActive || instUser.archivedAt || !instUser.user.isActive) throw Object.assign(new Error('The account is disabled and cannot receive a setup link.'), { statusCode: 409, code: 'ACCOUNT_DISABLED' });
      if (!instUser.user.mustChangePassword) throw Object.assign(new Error('The account is already active. Initial setup cannot be reissued.'), { statusCode: 409, code: 'ACCOUNT_ALREADY_ACTIVE' });

      const setup = await issueAccountSetupToken(tx, instUser.userId);
      await tx.user.update({ where: { id: instUser.userId }, data: { securityStamp: crypto.randomUUID() } });
      await tx.userSession.updateMany({ where: { userId: instUser.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await recordAuditEvent(tx, { institutionId: instId, actorUserId: req.user?.uid, action: 'ACCOUNT_SETUP_REISSUED', entityType: 'InstitutionUser', entityId: instUser.id, metadata: { userId: instUser.userId, expiresAt: setup.expiresAt.toISOString() } });
      return { instUser, setup };
    });

    return res.json({
      message: 'A new account setup link was issued.',
      id: result.instUser.id,
      accountStatus: 'PENDING_SETUP',
      setup: setupDeliveryMetadata(result.setup),
    });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode);
    if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 500) {
      return res.status(statusCode).json({ error: error.message, code: error.code });
    }
    throw error;
  }
}
