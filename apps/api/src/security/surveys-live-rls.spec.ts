import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';

const tables = [
  'surveys',
  'survey_sections',
  'survey_domains',
  'survey_indicators',
  'survey_rounds',
  'survey_segments',
  'survey_import_batches',
  'survey_indicator_results',
  'survey_domain_results',
  'survey_domain_comparisons',
  'survey_participation_results',
] as const;

const constraintError = (error: unknown) => {
  const candidate = error as { code?: string; message?: string };
  return ['P2002', 'P2003', 'P2010'].includes(candidate?.code || '')
    || /unique|foreign key|row-level security|permission denied/i.test(candidate?.message || '');
};

async function expectConstraintFailure(operation: () => Promise<unknown>, message: string): Promise<void> {
  try {
    await operation();
    assert.fail(message);
  } catch (error) {
    assert.ok(constraintError(error), `${message}: ${String(error)}`);
  }
}

test('surveys are physically protected by tenant RLS, constraints, and historical foreign keys', async () => {
  assert.notEqual(process.env['NODE_ENV'], 'production', 'Integration fixtures are disabled in production.');
  const runtimeUrl = process.env['RLS_RUNTIME_DATABASE_URL'];
  assert.ok(runtimeUrl, 'RLS_RUNTIME_DATABASE_URL must target school_app for the live RLS proof.');

  const [type, region, institutionStatus, language] = await Promise.all([
    admin.educationType.findFirst(),
    admin.region.findFirst(),
    admin.institutionStatus.findFirst(),
    admin.language.findFirst(),
  ]);
  assert.ok(type && region && institutionStatus && language, 'Global lookup fixtures are required.');

  const runtime = new PrismaClient({ datasourceUrl: runtimeUrl });
  const marker = `surveys-rls-${randomUUID().slice(0, 8)}`;
  const created = {
    institutions: [] as string[], years: [] as string[], surveys: [] as string[], sections: [] as string[], domains: [] as string[],
    indicators: [] as string[], rounds: [] as string[], segments: [] as string[], indicatorResults: [] as string[], domainResults: [] as string[],
    comparisons: [] as string[], participations: [] as string[],
  };

  try {
    const institutionA = await admin.institution.create({ data: { schoolCode: `${Date.now()}`.slice(-10), slug: `${marker}-a`, nameAr: 'Survey RLS A', typeId: type.id, regionId: region.id, statusId: institutionStatus.id, defaultLanguageId: language.id } });
    const institutionB = await admin.institution.create({ data: { schoolCode: `${Date.now() + 1}`.slice(-10), slug: `${marker}-b`, nameAr: 'Survey RLS B', typeId: type.id, regionId: region.id, statusId: institutionStatus.id, defaultLanguageId: language.id } });
    created.institutions.push(institutionA.id, institutionB.id);
    const yearA = await admin.academicYear.create({ data: { institutionId: institutionA.id, yearLabel: `${marker}-A`, startDate: new Date('2099-09-01'), endDate: new Date('2100-06-30') } });
    const yearB = await admin.academicYear.create({ data: { institutionId: institutionB.id, yearLabel: `${marker}-B`, startDate: new Date('2099-09-01'), endDate: new Date('2100-06-30') } });
    const alternateYearA = await admin.academicYear.create({ data: { institutionId: institutionA.id, yearLabel: `${marker}-A2`, startDate: new Date('2100-09-01'), endDate: new Date('2101-06-30') } });
    created.years.push(yearA.id, yearB.id, alternateYearA.id);

    const surveyA = await admin.survey.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, nameAr: 'استبيان أ' } });
    const surveyB = await admin.survey.create({ data: { institutionId: institutionB.id, academicYearId: yearB.id, nameAr: 'استبيان ب' } });
    created.surveys.push(surveyA.id, surveyB.id);
    const sectionA = await admin.surveySection.create({ data: { institutionId: institutionA.id, surveyId: surveyA.id, code: 'SECTION', nameAr: 'قسم أ' } });
    const sectionB = await admin.surveySection.create({ data: { institutionId: institutionB.id, surveyId: surveyB.id, code: 'SECTION', nameAr: 'قسم ب' } });
    created.sections.push(sectionA.id, sectionB.id);
    const domainA = await admin.surveyDomain.create({ data: { institutionId: institutionA.id, surveyId: surveyA.id, sectionId: sectionA.id, code: 'DOMAIN', nameAr: 'مجال أ' } });
    const domainB = await admin.surveyDomain.create({ data: { institutionId: institutionB.id, surveyId: surveyB.id, sectionId: sectionB.id, code: 'DOMAIN', nameAr: 'مجال ب' } });
    created.domains.push(domainA.id, domainB.id);
    const indicatorA = await admin.surveyIndicator.create({ data: { institutionId: institutionA.id, surveyId: surveyA.id, domainId: domainA.id, code: 'INDICATOR', textAr: 'مؤشر أ' } });
    const indicatorB = await admin.surveyIndicator.create({ data: { institutionId: institutionB.id, surveyId: surveyB.id, domainId: domainB.id, code: 'INDICATOR', textAr: 'مؤشر ب' } });
    created.indicators.push(indicatorA.id, indicatorB.id);
    const roundA = await admin.surveyRound.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, surveyId: surveyA.id, code: 'ROUND', nameAr: 'جولة أ', sequenceNumber: 1 } });
    const roundB = await admin.surveyRound.create({ data: { institutionId: institutionB.id, academicYearId: yearB.id, surveyId: surveyB.id, code: 'ROUND', nameAr: 'جولة ب', sequenceNumber: 1 } });
    created.rounds.push(roundA.id, roundB.id);
    const segmentA = await admin.surveySegment.create({ data: { institutionId: institutionA.id, surveyId: surveyA.id, code: 'SEGMENT', nameAr: 'شريحة أ' } });
    const segmentB = await admin.surveySegment.create({ data: { institutionId: institutionB.id, surveyId: surveyB.id, code: 'SEGMENT', nameAr: 'شريحة ب' } });
    created.segments.push(segmentA.id, segmentB.id);
    const indicatorResultA = await admin.surveyIndicatorResult.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, surveyId: surveyA.id, roundId: roundA.id, sectionId: sectionA.id, domainId: domainA.id, indicatorId: indicatorA.id, segmentId: segmentA.id, reportedPercentage: 80 } });
    const indicatorResultB = await admin.surveyIndicatorResult.create({ data: { institutionId: institutionB.id, academicYearId: yearB.id, surveyId: surveyB.id, roundId: roundB.id, sectionId: sectionB.id, domainId: domainB.id, indicatorId: indicatorB.id, segmentId: segmentB.id, reportedPercentage: 75 } });
    created.indicatorResults.push(indicatorResultA.id, indicatorResultB.id);
    const domainResultA = await admin.surveyDomainResult.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, surveyId: surveyA.id, roundId: roundA.id, domainId: domainA.id, segmentId: segmentA.id, scorePercentage: 80 } });
    created.domainResults.push(domainResultA.id);
    const participationA = await admin.surveyParticipationResult.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, surveyId: surveyA.id, roundId: roundA.id, segmentId: segmentA.id, participantCount: 8, eligibleCount: 10, responseRate: 80 } });
    created.participations.push(participationA.id);

    const physical = await admin.$queryRawUnsafe<Array<{ table_name: string; rls: boolean; force_rls: boolean; policy_name: string | null }>>(`
      SELECT c.relname AS table_name, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls, p.policyname AS policy_name
      FROM pg_class c
      LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = c.relname
      WHERE c.relname IN (${tables.map((table) => `'${table}'`).join(', ')})
      ORDER BY c.relname
    `);
    for (const table of tables) {
      const row = physical.find((item) => item.table_name === table);
      assert.equal(row?.rls, true, `${table} must enable RLS`);
      assert.equal(row?.force_rls, true, `${table} must force RLS`);
      assert.equal(row?.policy_name, `${table}_tenant_policy`, `${table} must have its tenant policy`);
    }

    const grants = await admin.$queryRawUnsafe<Array<{ table_name: string; can_select: boolean; can_insert: boolean; can_update: boolean; can_delete: boolean }>>(`
      SELECT table_name, has_table_privilege('school_app', format('public.%I', table_name), 'SELECT') AS can_select,
        has_table_privilege('school_app', format('public.%I', table_name), 'INSERT') AS can_insert,
        has_table_privilege('school_app', format('public.%I', table_name), 'UPDATE') AS can_update,
        has_table_privilege('school_app', format('public.%I', table_name), 'DELETE') AS can_delete
      FROM (VALUES ${tables.map((table) => `('${table}')`).join(', ')}) AS survey_tables(table_name)
    `);
    for (const grant of grants) {
      assert.equal(grant.can_select, true, `${grant.table_name} must grant SELECT to school_app`);
      assert.equal(grant.can_insert, true, `${grant.table_name} must grant INSERT to school_app`);
      assert.equal(grant.can_update, true, `${grant.table_name} must grant UPDATE to school_app`);
      assert.equal(grant.can_delete, false, `${grant.table_name} must not grant DELETE to school_app`);
    }

    const foreignKeys = await admin.$queryRawUnsafe<Array<{ table_name: string; delete_action: string }>>(`
      SELECT conrelid::regclass::text AS table_name, confdeltype AS delete_action
      FROM pg_constraint
      WHERE contype = 'f' AND conrelid::regclass::text IN ('survey_indicator_results', 'survey_domain_results', 'survey_domain_comparisons', 'survey_participation_results')
    `);
    assert.ok(foreignKeys.length > 0, 'Survey result foreign keys must exist');
    assert.ok(foreignKeys.every((key) => key.delete_action === 'r'), 'Historical survey foreign keys must use RESTRICT');

    await expectConstraintFailure(() => admin.surveySection.create({ data: { institutionId: institutionB.id, surveyId: surveyA.id, code: 'CROSS', nameAr: 'رفض' } }), 'Cross-tenant section must be rejected by the database');
    await expectConstraintFailure(() => admin.surveyRound.create({ data: { institutionId: institutionA.id, academicYearId: alternateYearA.id, surveyId: surveyA.id, code: 'WRONG-YEAR', nameAr: 'رفض', sequenceNumber: 2 } }), 'Round must match the survey academic year');
    await expectConstraintFailure(() => admin.surveyIndicatorResult.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, surveyId: surveyA.id, roundId: roundA.id, sectionId: sectionA.id, domainId: domainA.id, indicatorId: indicatorB.id, segmentId: segmentA.id, reportedPercentage: 50 } }), 'Cross-tenant indicator result must be rejected by the database');

    await expectConstraintFailure(() => admin.surveySection.create({ data: { institutionId: institutionA.id, surveyId: surveyA.id, code: sectionA.code, nameAr: 'مكرر' } }), 'Section code must be unique within its survey');
    await expectConstraintFailure(() => admin.surveyDomain.create({ data: { institutionId: institutionA.id, surveyId: surveyA.id, sectionId: sectionA.id, code: domainA.code, nameAr: 'مكرر' } }), 'Domain code must be unique within its survey');
    await expectConstraintFailure(() => admin.surveyIndicator.create({ data: { institutionId: institutionA.id, surveyId: surveyA.id, domainId: domainA.id, code: indicatorA.code, textAr: 'مكرر' } }), 'Indicator code must be unique within its survey');
    await expectConstraintFailure(() => admin.surveyRound.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, surveyId: surveyA.id, code: roundA.code, nameAr: 'مكرر', sequenceNumber: 2 } }), 'Round code must be unique within its survey');
    await expectConstraintFailure(() => admin.surveySegment.create({ data: { institutionId: institutionA.id, surveyId: surveyA.id, code: segmentA.code, nameAr: 'مكرر' } }), 'Segment code must be unique within its survey');
    await expectConstraintFailure(() => admin.surveyIndicatorResult.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, surveyId: surveyA.id, roundId: roundA.id, sectionId: sectionA.id, domainId: domainA.id, indicatorId: indicatorA.id, segmentId: segmentA.id, reportedPercentage: 80 } }), 'Indicator result must be unique per round, indicator, and segment');
    await expectConstraintFailure(() => admin.surveyDomainResult.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, surveyId: surveyA.id, roundId: roundA.id, domainId: domainA.id, segmentId: segmentA.id, scorePercentage: 80 } }), 'Domain result must be unique per round, domain, and segment');
    await expectConstraintFailure(() => admin.surveyParticipationResult.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, surveyId: surveyA.id, roundId: roundA.id, segmentId: segmentA.id, participantCount: 8, eligibleCount: 10, responseRate: 80 } }), 'Participation result must be unique per round and segment');
    const comparison = await admin.surveyDomainComparison.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, surveyId: surveyA.id, roundId: roundA.id, domainId: domainA.id, segmentId: segmentA.id, comparisonType: 'BASELINE' } });
    created.comparisons.push(comparison.id);
    await expectConstraintFailure(() => admin.surveyDomainComparison.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, surveyId: surveyA.id, roundId: roundA.id, domainId: domainA.id, segmentId: segmentA.id, comparisonType: 'BASELINE' } }), 'Domain comparison must be unique per round, domain, segment, and type');

    const runtimeRole = await runtime.$queryRawUnsafe<Array<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>>('SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');
    assert.deepEqual(runtimeRole[0], { current_user: 'school_app', rolsuper: false, rolbypassrls: false });
    assert.equal((await runtime.survey.findMany()).length, 0, 'Missing tenant context must hide surveys');
    const visibleA = await runtime.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_institution_id', ${institutionA.id}, true)`;
      return Promise.all([tx.survey.findMany(), tx.surveyIndicator.findMany(), tx.surveyIndicatorResult.findMany()]);
    });
    assert.ok(visibleA[0].some((survey) => survey.id === surveyA.id));
    assert.ok(!visibleA[0].some((survey) => survey.id === surveyB.id));
    assert.ok(visibleA[1].some((indicator) => indicator.id === indicatorA.id));
    assert.ok(!visibleA[1].some((indicator) => indicator.id === indicatorB.id));
    assert.ok(visibleA[2].some((result) => result.id === indicatorResultA.id));
    assert.ok(!visibleA[2].some((result) => result.id === indicatorResultB.id));

    await expectConstraintFailure(() => runtime.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_institution_id', ${institutionB.id}, true)`;
      return tx.survey.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, nameAr: 'إدخال عابر' } });
    }), 'RLS must reject an A insert under B context');
    await expectConstraintFailure(() => runtime.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_institution_id', ${institutionB.id}, true)`;
      return tx.survey.deleteMany({ where: { id: surveyA.id } });
    }), 'school_app must not delete Institution A data under B context');
    const visibleB = await runtime.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_institution_id', ${institutionB.id}, true)`;
      const update = await tx.survey.updateMany({ where: { id: surveyA.id }, data: { nameAr: 'محجوب' } });
      return { surveys: await tx.survey.findMany(), indicators: await tx.surveyIndicator.findMany(), results: await tx.surveyIndicatorResult.findMany(), updateCount: update.count };
    });
    assert.equal(visibleB.updateCount, 0, 'Institution B must not update Institution A data');
    assert.ok(visibleB.surveys.some((survey) => survey.id === surveyB.id));
    assert.ok(!visibleB.surveys.some((survey) => survey.id === surveyA.id));
    assert.ok(visibleB.indicators.some((indicator) => indicator.id === indicatorB.id));
    assert.ok(!visibleB.indicators.some((indicator) => indicator.id === indicatorA.id));
    assert.ok(!visibleB.results.some((result) => result.id === indicatorResultA.id));
    assert.equal((await admin.survey.findUniqueOrThrow({ where: { id: surveyA.id } })).nameAr, 'استبيان أ');
    const visibleAgainA = await runtime.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_institution_id', ${institutionA.id}, true)`;
      return tx.survey.findUnique({ where: { id: surveyA.id } });
    });
    assert.equal(visibleAgainA?.id, surveyA.id, 'Returning to Institution A context must reveal A data again');
  } finally {
    await runtime.$disconnect();
    if (created.comparisons.length) await admin.surveyDomainComparison.deleteMany({ where: { id: { in: created.comparisons } } }).catch(() => undefined);
    if (created.participations.length) await admin.surveyParticipationResult.deleteMany({ where: { id: { in: created.participations } } }).catch(() => undefined);
    if (created.domainResults.length) await admin.surveyDomainResult.deleteMany({ where: { id: { in: created.domainResults } } }).catch(() => undefined);
    if (created.indicatorResults.length) await admin.surveyIndicatorResult.deleteMany({ where: { id: { in: created.indicatorResults } } }).catch(() => undefined);
    if (created.segments.length) await admin.surveySegment.deleteMany({ where: { id: { in: created.segments } } }).catch(() => undefined);
    if (created.rounds.length) await admin.surveyRound.deleteMany({ where: { id: { in: created.rounds } } }).catch(() => undefined);
    if (created.indicators.length) await admin.surveyIndicator.deleteMany({ where: { id: { in: created.indicators } } }).catch(() => undefined);
    if (created.domains.length) await admin.surveyDomain.deleteMany({ where: { id: { in: created.domains } } }).catch(() => undefined);
    if (created.sections.length) await admin.surveySection.deleteMany({ where: { id: { in: created.sections } } }).catch(() => undefined);
    if (created.surveys.length) await admin.survey.deleteMany({ where: { id: { in: created.surveys } } }).catch(() => undefined);
    if (created.years.length) await admin.academicYear.deleteMany({ where: { id: { in: created.years } } }).catch(() => undefined);
    if (created.institutions.length) await admin.institution.deleteMany({ where: { id: { in: created.institutions } } }).catch(() => undefined);
    await admin.$disconnect();
  }
});
