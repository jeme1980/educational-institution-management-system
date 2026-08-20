import { strict as assert } from 'node:assert';
import { PrismaClient } from '@prisma/client';
import { testAdminPrisma as prisma } from '../db/test-admin-prisma';

const isConstraintError = (error: any) => ['P2002', 'P2003'].includes(error?.code) || /unique|foreign key/i.test(String(error?.message || ''));

async function main() {
  const [type, region, institutionStatus, language, studentStatus, gender, relationType] = await Promise.all([
    prisma.educationType.findFirst(), prisma.region.findFirst(), prisma.institutionStatus.findFirst(), prisma.language.findFirst(),
    prisma.studentStatus.findFirst(), prisma.gender.findFirst(), prisma.relationType.findFirst(),
  ]);
  assert.ok(type && region && institutionStatus && language && studentStatus && gender && relationType, '8C lookup fixtures are required');
  const marker = `phase8c-${Date.now()}`;
  const institutionA = await prisma.institution.create({ data: { schoolCode: `${Date.now()}`.slice(-10), slug: `${marker}-a`, nameAr: 'Phase 8C A', typeId: type.id, regionId: region.id, statusId: institutionStatus.id, defaultLanguageId: language.id } });
  const institutionB = await prisma.institution.create({ data: { schoolCode: `${Date.now() + 1}`.slice(-10), slug: `${marker}-b`, nameAr: 'Phase 8C B', typeId: type.id, regionId: region.id, statusId: institutionStatus.id, defaultLanguageId: language.id } });
  const studentA = await prisma.student.create({ data: { institutionId: institutionA.id, nationalId: `${Date.now()}`.slice(-10), studentStatusId: studentStatus.id, genderId: gender.id, firstNameAr: 'Phase 8C', lastNameAr: 'Student A' } });
  const studentA2 = await prisma.student.create({ data: { institutionId: institutionA.id, nationalId: `${Date.now() + 1}`.slice(-10), studentStatusId: studentStatus.id, genderId: gender.id, firstNameAr: 'Phase 8C', lastNameAr: 'Student A2' } });
  const studentB = await prisma.student.create({ data: { institutionId: institutionB.id, nationalId: `${Date.now() + 2}`.slice(-10), studentStatusId: studentStatus.id, genderId: gender.id, firstNameAr: 'Phase 8C', lastNameAr: 'Student B' } });
  let guardianA: string | undefined;
  let guardianB: string | undefined;
  let linkA: string | undefined;
  let linkA2: string | undefined;
  let profileA: string | undefined;
  try {
    guardianA = (await prisma.guardian.create({ data: { institutionId: institutionA.id, nationalId: `${Date.now()}`.slice(-10), firstNameAr: 'Guardian', lastNameAr: 'A', primaryPhoneNumber: '0500000001' } })).id;
    guardianB = (await prisma.guardian.create({ data: { institutionId: institutionB.id, nationalId: `${Date.now() + 1}`.slice(-10), firstNameAr: 'Guardian', lastNameAr: 'B', primaryPhoneNumber: '0500000002' } })).id;
    linkA = (await prisma.studentGuardian.create({ data: { institutionId: institutionA.id, studentId: studentA.id, guardianId: guardianA, relationTypeId: relationType.id, isPrimaryContact: true } })).id;
    linkA2 = (await prisma.studentGuardian.create({ data: { institutionId: institutionA.id, studentId: studentA2.id, guardianId: guardianA, relationTypeId: relationType.id } })).id;
    assert.ok(linkA && linkA2, 'Guardian links must be created');
    try { await prisma.studentGuardian.create({ data: { institutionId: institutionA.id, studentId: studentA.id, guardianId: guardianA, relationTypeId: relationType.id } }); assert.fail('Duplicate guardian relation must be blocked'); } catch (error) { assert.ok(isConstraintError(error)); }
    try { await prisma.studentGuardian.create({ data: { institutionId: institutionA.id, studentId: studentA.id, guardianId: guardianB, relationTypeId: relationType.id } }); assert.fail('Cross-institution guardian relation must be blocked'); } catch (error) { assert.ok(isConstraintError(error)); }
    try { await prisma.studentGuardian.create({ data: { institutionId: institutionA.id, studentId: studentA.id, guardianId: guardianB, relationTypeId: relationType.id, isPrimaryContact: true } }); assert.fail('Cross-institution primary guardian relation must be blocked'); } catch (error) { assert.ok(isConstraintError(error)); }

    const profile = await prisma.studentMedicalProfile.create({ data: { institutionId: institutionA.id, studentId: studentA.id, bloodType: 'A+' } });
    profileA = profile.id;
    assert.equal((await prisma.studentMedicalProfile.update({ where: { id: profile.id }, data: { allergiesDescription: 'Pollen' } })).allergiesDescription, 'Pollen');
    try { await prisma.studentMedicalProfile.create({ data: { institutionId: institutionA.id, studentId: studentA.id } }); assert.fail('Duplicate medical profile must be blocked'); } catch (error) { assert.ok(isConstraintError(error)); }
    try { await prisma.studentMedicalProfile.create({ data: { institutionId: institutionA.id, studentId: studentB.id } }); assert.fail('Cross-institution medical profile must be blocked'); } catch (error) { assert.ok(isConstraintError(error)); }

    const [guardianTable, linkTable, medicalTable, role, policies] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(`select relrowsecurity, relforcerowsecurity from pg_class where oid = 'guardians'::regclass`),
      prisma.$queryRawUnsafe<any[]>(`select relrowsecurity, relforcerowsecurity from pg_class where oid = 'student_guardians'::regclass`),
      prisma.$queryRawUnsafe<any[]>(`select relrowsecurity, relforcerowsecurity from pg_class where oid = 'student_medical_profiles'::regclass`),
      prisma.$queryRawUnsafe<any[]>(`select rolbypassrls from pg_roles where rolname = 'school_app'`),
      prisma.$queryRawUnsafe<any[]>(`select policyname from pg_policies where tablename in ('guardians','student_guardians','student_medical_profiles')`),
    ]);
    for (const table of [guardianTable[0], linkTable[0], medicalTable[0]]) { assert.equal(table?.relrowsecurity, true); assert.equal(table?.relforcerowsecurity, true); }
    assert.equal(role[0]?.rolbypassrls, false);
    assert.equal(policies.length >= 3, true, 'Guardian and medical RLS policies must exist');

    const runtimeUrl = process.env['GUARDIAN_RUNTIME_DATABASE_URL'];
    if (runtimeUrl) {
      const runtime = new PrismaClient({ datasources: { db: { url: runtimeUrl } } });
      try {
        assert.equal((await runtime.guardian.findMany()).length, 0, 'Missing RLS context must hide guardians');
        const visible = await runtime.$transaction(async (tx) => { await tx.$executeRaw`select set_config('app.current_institution_id', ${institutionA.id}, true)`; return tx.studentGuardian.findMany(); });
        assert.ok(visible.some((link) => link.id === linkA));
        assert.ok(!visible.some((link) => link.institutionId === institutionB.id));
      } finally { await runtime.$disconnect(); }
    }

    await prisma.studentGuardian.delete({ where: { id: linkA } });
    linkA = undefined;
    assert.ok(await prisma.guardian.findUnique({ where: { id: guardianA } }), 'Removing one relation must not delete a shared guardian');
  } finally {
    if (linkA) await prisma.studentGuardian.delete({ where: { id: linkA } }).catch(() => undefined);
    if (linkA2) await prisma.studentGuardian.delete({ where: { id: linkA2 } }).catch(() => undefined);
    if (profileA) await prisma.studentMedicalProfile.delete({ where: { id: profileA } }).catch(() => undefined);
    if (guardianA) await prisma.guardian.delete({ where: { id: guardianA } }).catch(() => undefined);
    if (guardianB) await prisma.guardian.delete({ where: { id: guardianB } }).catch(() => undefined);
    await prisma.student.deleteMany({ where: { id: { in: [studentA.id, studentA2.id, studentB.id] } } });
    await prisma.institution.deleteMany({ where: { id: { in: [institutionA.id, institutionB.id] } } });
  }
  console.log('Phase 8C guardian and medical integrity tests passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
