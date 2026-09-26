import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import app from '../server';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';
import { createLocalAccessToken } from '../middleware/auth';

test('survey HTTP routes enforce authentication and persisted permissions', async () => {
  assert.notEqual(process.env.NODE_ENV, 'production');
  const [institution, readPermission, updatePermission] = await Promise.all([
    admin.institution.findFirstOrThrow({ where: { archivedAt: null, academicYears: { some: { archivedAt: null } } } }),
    admin.permission.findUniqueOrThrow({ where: { module_action: { module: 'surveys', action: 'READ' } } }),
    admin.permission.findUniqueOrThrow({ where: { module_action: { module: 'surveys', action: 'UPDATE' } } }),
  ]);
  const year = await admin.academicYear.findFirstOrThrow({ where: { institutionId: institution.id, archivedAt: null } });
  const suffix = randomUUID().slice(0, 8); const users: string[] = []; const staff: string[] = []; const memberships: string[] = []; const roles: string[] = []; const surveyIds: string[] = [];
  const server = createServer(app); await new Promise<void>((resolve) => server.listen(0, resolve)); const port = (server.address() as any).port;
  const headers = (token?: string) => ({ ...(token ? { authorization: `Bearer ${token}` } : {}), 'x-institution-id': institution.id, 'x-academic-year-id': year.id, 'content-type': 'application/json' });
  try {
    const createActor = async (kind: string, permissions: string[]) => {
      const user = await admin.user.create({ data: { email: `${kind}-${suffix}@example.test`, normalizedEmail: `${kind}-${suffix}@example.test`, passwordHash: 'not-used-by-token' } }); users.push(user.id);
      const staffMember = await admin.staffMember.create({ data: { institutionId: institution.id, firstNameAr: kind, familyNameAr: 'Survey' } }); staff.push(staffMember.id);
      const membership = await admin.institutionUser.create({ data: { institutionId: institution.id, userId: user.id, staffMemberId: staffMember.id } }); memberships.push(membership.id);
      const role = await admin.role.create({ data: { institutionId: institution.id, nameAr: `${kind}-${suffix}` } }); roles.push(role.id);
      await admin.institutionUserRole.create({ data: { institutionId: institution.id, institutionUserId: membership.id, roleId: role.id } });
      if (permissions.length) await admin.rolePermission.createMany({ data: permissions.map((permissionId) => ({ institutionId: institution.id, roleId: role.id, permissionId })) });
      return createLocalAccessToken(user.id, user.email);
    };
    const [noneToken, readToken, updateToken] = await Promise.all([createActor('none', []), createActor('read', [readPermission.id]), createActor('update', [updatePermission.id])]);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/surveys?academicYearId=${year.id}`)).status, 401);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/surveys?academicYearId=${year.id}`, { headers: headers(noneToken) })).status, 403);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/surveys?academicYearId=${year.id}`, { headers: headers(readToken) })).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/surveys`, { method: 'POST', headers: headers(readToken), body: JSON.stringify({ academicYearId: year.id, nameAr: 'مرفوض' }) })).status, 403);
    const created = await fetch(`http://127.0.0.1:${port}/api/surveys`, { method: 'POST', headers: headers(updateToken), body: JSON.stringify({ academicYearId: year.id, nameAr: `Survey ${suffix}` }) }); assert.equal(created.status, 201); surveyIds.push((await created.json()).id);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/surveys/${surveyIds[0]}`, { method: 'PATCH', headers: headers(readToken), body: JSON.stringify({ nameAr: 'مرفوض' }) })).status, 403);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (surveyIds.length) await admin.survey.deleteMany({ where: { id: { in: surveyIds } } });
    if (memberships.length) await admin.institutionUserRole.deleteMany({ where: { institutionUserId: { in: memberships } } });
    if (roles.length) await admin.rolePermission.deleteMany({ where: { roleId: { in: roles } } });
    if (memberships.length) await admin.institutionUser.deleteMany({ where: { id: { in: memberships } } });
    if (roles.length) await admin.role.deleteMany({ where: { id: { in: roles } } });
    if (staff.length) await admin.staffMember.deleteMany({ where: { id: { in: staff } } });
    if (users.length) await admin.user.deleteMany({ where: { id: { in: users } } });
    await admin.$disconnect();
  }
});
