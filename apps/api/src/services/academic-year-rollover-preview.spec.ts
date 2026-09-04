import assert from 'node:assert/strict';
import test from 'node:test';
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
