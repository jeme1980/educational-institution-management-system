import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { executionPlanFingerprint } from './academic-year-rollover-execution.service';
import { academicYearRolloverExecuteSchema } from '../validation/academic-year-rollover.schemas';

const base = {
  rollover: { id: 'rollover', sourceAcademicYearId: 'source', targetAcademicYearId: 'target' },
  classMappings: [{ id: 'mapping', targetNameAr: 'الأول أ', action: 'CREATE' }],
  studentDecisions: [{ id: 'decision', action: 'PROMOTE' }],
  target: { enrollments: [] },
  updatedAt: 'ignored',
};

test('execution fingerprint is deterministic and ignores array order', () => {
  const left = { ...base, classMappings: [{ id: 'b' }, { id: 'a' }] };
  const right = { ...base, classMappings: [{ id: 'a' }, { id: 'b' }] };
  assert.equal(executionPlanFingerprint(left), executionPlanFingerprint(right));
});

test('execution fingerprint changes for target class names and student decisions', () => {
  assert.notEqual(executionPlanFingerprint(base), executionPlanFingerprint({ ...base, classMappings: [{ ...base.classMappings[0], targetNameAr: 'الأول ب' }] }));
  assert.notEqual(executionPlanFingerprint(base), executionPlanFingerprint({ ...base, studentDecisions: [{ id: 'decision', action: 'REPEAT' }] }));
});

test('execution fingerprint changes when a conflicting target enrollment appears', () => {
  assert.notEqual(executionPlanFingerprint(base), executionPlanFingerprint({ ...base, target: { enrollments: [{ studentId: 'student', classId: 'other' }] } }));
});

test('execution fingerprint ignores updatedAt recursively', () => {
  assert.equal(executionPlanFingerprint(base), executionPlanFingerprint({ ...base, updatedAt: 'different', target: { enrollments: [], updatedAt: 'different' } }));
});

test('execute body accepts only a SHA-256 fingerprint', () => {
  assert.equal(academicYearRolloverExecuteSchema.safeParse({ executionPlanFingerprint: 'a'.repeat(64) }).success, true);
  assert.equal(academicYearRolloverExecuteSchema.safeParse({ executionPlanFingerprint: 'invalid' }).success, false);
  assert.equal(academicYearRolloverExecuteSchema.safeParse({ executionPlanFingerprint: 'a'.repeat(64), extra: true }).success, false);
});

test('execute route uses settings:update and no web execute integration exists', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'academic-year-rollover.routes.js'), 'utf8');
  const webService = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'web', 'src', 'app', 'pages', 'academic-years', 'services', 'rollover-api.service.ts'), 'utf8');
  const executeRoute = routes.split('\n').find(line => line.includes("rollover/:rolloverId/execute")) || '';
  assert.match(executeRoute, /requirePermission.*'settings', 'update'/);
  assert.doesNotMatch(webService, /\/execute/);
});

test('execute source contains no historical-data or current-year writes', () => {
  const source = fs.readFileSync(path.join(__dirname, 'academic-year-rollover-execution.service.js'), 'utf8');
  for (const model of ['attendance', 'exam', 'examQuestion', 'studentExamResult', 'studentQuestionScore', 'intervention', 'studyGroup', 'studyGroupStudent', 'student']) assert.doesNotMatch(source, new RegExp(`\\.${model}\\.(create|update|delete|upsert)`));
  assert.doesNotMatch(source, /isCurrent\s*:/);
  assert.match(source, /ROLLBACK TO SAVEPOINT rollover_execute/);
  assert.match(source, /pg_try_advisory_xact_lock/);
});
