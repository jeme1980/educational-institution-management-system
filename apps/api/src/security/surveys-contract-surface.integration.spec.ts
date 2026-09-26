import 'dotenv/config';
import assert from 'node:assert/strict';
import test from 'node:test';
import surveyRouter from '../routes/surveys.routes';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';

const surveyTables = [
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

test('survey route surface and school_app database privileges preserve Phase 2 boundaries', async () => {
  const routes = (surveyRouter as any).stack
    .filter((layer: any) => layer.route)
    .flatMap((layer: any) => Object.keys(layer.route.methods).map((method) => ({ method: method.toUpperCase(), path: String(layer.route.path) })));
  assert.ok(routes.length > 0);
  assert.equal(routes.some((route: any) => route.method === 'DELETE'), false);
  assert.equal(routes.some((route: any) => /result|import|batch/i.test(route.path)), false);

  const privileges = await admin.$queryRawUnsafe<Array<{
    table_name: string;
    can_select: boolean;
    can_insert: boolean;
    can_update: boolean;
    can_delete: boolean;
  }>>(`
    SELECT table_name,
      has_table_privilege('school_app', format('public.%I', table_name), 'SELECT') AS can_select,
      has_table_privilege('school_app', format('public.%I', table_name), 'INSERT') AS can_insert,
      has_table_privilege('school_app', format('public.%I', table_name), 'UPDATE') AS can_update,
      has_table_privilege('school_app', format('public.%I', table_name), 'DELETE') AS can_delete
    FROM (VALUES ${surveyTables.map((table) => `('${table}')`).join(', ')}) AS survey_tables(table_name)
  `);
  assert.equal(privileges.length, surveyTables.length);
  for (const privilege of privileges) {
    assert.equal(privilege.can_select, true, `${privilege.table_name} must keep SELECT`);
    assert.equal(privilege.can_insert, true, `${privilege.table_name} must keep INSERT`);
    assert.equal(privilege.can_update, true, `${privilege.table_name} must keep UPDATE`);
    assert.equal(privilege.can_delete, false, `${privilege.table_name} must not grant DELETE`);
  }

  const rls = await admin.$queryRawUnsafe<Array<{ table_name: string; rls_enabled: boolean; force_rls: boolean }>>(`
    SELECT relname AS table_name, relrowsecurity AS rls_enabled, relforcerowsecurity AS force_rls
    FROM pg_class
    WHERE relname IN (${surveyTables.map((table) => `'${table}'`).join(', ')})
    ORDER BY relname
  `);
  assert.equal(rls.length, surveyTables.length);
  for (const table of rls) {
    assert.equal(table.rls_enabled, true, `${table.table_name} must keep RLS enabled`);
    assert.equal(table.force_rls, true, `${table.table_name} must keep FORCE RLS enabled`);
  }
  await admin.$disconnect();
});
