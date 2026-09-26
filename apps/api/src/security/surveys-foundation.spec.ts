import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const prismaDirectory = join(__dirname, '..', '..', 'prisma');
const schema = readFileSync(join(prismaDirectory, 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(prismaDirectory, 'migrations', '20260926120000_add_school_surveys_foundation', 'migration.sql'),
  'utf8',
);

const models = [
  'Survey',
  'SurveySection',
  'SurveyDomain',
  'SurveyIndicator',
  'SurveyRound',
  'SurveySegment',
  'SurveyImportBatch',
  'SurveyIndicatorResult',
  'SurveyDomainResult',
  'SurveyDomainComparison',
  'SurveyParticipationResult',
] as const;

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

test('survey foundation keeps all records institution-scoped and academic-year-scoped where required', () => {
  for (const model of models) {
    assert.match(schema, new RegExp(`model ${model} \\{[\\s\\S]*?institutionId\\s+String`));
  }

  for (const model of [
    'Survey',
    'SurveyRound',
    'SurveyImportBatch',
    'SurveyIndicatorResult',
    'SurveyDomainResult',
    'SurveyDomainComparison',
    'SurveyParticipationResult',
  ]) {
    assert.match(schema, new RegExp(`model ${model} \\{[\\s\\S]*?academicYearId\\s+String`));
  }

  assert.match(schema, /@@unique\(\[institutionId, academicYearId, id\]\)/);
  assert.doesNotMatch(schema, /model Survey(?:Response|Respondent)\b/);
  assert.doesNotMatch(schema, /enum Survey\w+/);
});

test('survey migration enforces tenant RLS and restricted historical foreign keys', () => {
  for (const table of tables) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
    assert.match(migration, new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`));
    assert.match(migration, new RegExp(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`));
    assert.match(migration, new RegExp(`CREATE POLICY "${table}_tenant_policy"`));
    assert.match(migration, new RegExp(`ON "${table}" FOR ALL`));
  }

  assert.match(migration, /current_setting\('app\.current_institution_id', true\)/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE ON TABLE[\s\S]*?TO school_app;/);
  assert.doesNotMatch(migration, /ON DELETE CASCADE/);
  assert.match(migration, /"importedByUserId"\) REFERENCES "users"\("id"\) ON DELETE SET NULL/);
  assert.match(
    migration,
    /FOREIGN KEY \("institutionId", "surveyId", "roundId", "importBatchId"\)[\s\S]*?REFERENCES "survey_import_batches"\("institutionId", "surveyId", "roundId", "id"\)/,
  );
});
