import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nextGradeBySortOrder } from './academic-year-rollover-preview.service';
import { academicYearRolloverPreviewSchema } from '../validation/academic-year-rollover.schemas';

const grades = [{ id: 'a', sortOrder: 1 }, { id: 'b', sortOrder: 2 }, { id: 'c', sortOrder: 3 }];

test('preview request accepts only source and target year ids', () => {
  const parsed = academicYearRolloverPreviewSchema.safeParse({ sourceAcademicYearId: '00000000-0000-4000-8000-000000000001', targetAcademicYearId: '00000000-0000-4000-8000-000000000002' });
  assert.equal(parsed.success, true);
  assert.equal(academicYearRolloverPreviewSchema.safeParse({ ...parsed.success ? parsed.data : {}, extra: true }).success, false);
});

test('grade progression uses sortOrder and not code arithmetic', () => {
  assert.deepEqual(nextGradeBySortOrder(grades[0], grades), grades[1]);
  assert.equal(nextGradeBySortOrder(grades[2], grades), null);
});

test('grade progression is deterministic when sortOrder ties', () => {
  const tied = [{ id: 'z', sortOrder: 1 }, { id: 'a', sortOrder: 1 }, { id: 'b', sortOrder: 2 }];
  assert.equal(nextGradeBySortOrder(tied[1], tied), tied[0]);
});

test('terminal grade has no automatic promotion candidate', () => {
  assert.equal(nextGradeBySortOrder(grades[2], grades), null);
});

test('preview service has no write-capable Prisma operations', () => {
  const source = readFileSync(join(__dirname, 'academic-year-rollover-preview.service.js'), 'utf8');
  assert.equal(/\.create\(|\.createMany\(|\.update\(|\.delete\(|\$transaction/.test(source), false);
});

test('preview service uses batch loading rather than per-row Prisma calls', () => {
  const source = readFileSync(join(__dirname, 'academic-year-rollover-preview.service.js'), 'utf8');
  assert.equal(/Promise\.all\(\[/.test(source), true);
  assert.equal(/forEach\([^)]*prisma|map\([^)]*prisma/.test(source), false);
});

test('preview response policy is explicitly read-only', () => {
  const source = readFileSync(join(__dirname, 'academic-year-rollover-preview.service.js'), 'utf8');
  assert.match(source, /sourceMutated:\s*false/);
  assert.match(source, /currentYearChanged:\s*false/);
  assert.match(source, /historicalRecordsCopied:\s*false/);
});
