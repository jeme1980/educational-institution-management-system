import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { classMappingIdentityComplete, classMappingPatchData, classMappingValidationStatus, enrollmentTargetDefaults, skillTargetMatch, staffAssignmentTargetDates, topicTargetMatch } from './academic-year-rollover-contracts';

const createBase = { action: 'CREATE' as const, targetStageId: 'stage', targetGradeLevelId: 'grade', targetParallelNumber: 1, targetClassId: null };

test('CREATE mapping without required Arabic target name is unresolved', () => assert.equal(classMappingValidationStatus(createBase), 'UNRESOLVED'));
test('CREATE mapping with complete identity is ready', () => assert.equal(classMappingValidationStatus({ ...createBase, targetNameAr: 'الصف الأول أ' }), 'VALID'));
test('USE_EXISTING does not require target names', () => assert.equal(classMappingValidationStatus({ action: 'USE_EXISTING', targetClassId: 'class' }), 'VALID'));
test('SKIP does not require target identity', () => assert.equal(classMappingIdentityComplete({ action: 'SKIP' }), true));
test('mapping patch clears names unless action is CREATE', () => {
  assert.equal(classMappingPatchData({ action: 'USE_EXISTING', targetClassId: 'class', targetNameAr: 'ignored' }).targetNameAr, null);
  assert.equal(classMappingPatchData({ ...createBase, targetNameAr: '  اسم  ' }).targetNameAr, 'اسم');
});
test('class mapping patch lookup is scoped to institution and rollover', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'academic-year-rollover.controller.js'), 'utf8');
  assert.match(source, /findFirst\(\{ where: \{ id: mappingId, rolloverId, institutionId \}/);
});
test('staff assignment dates start at the target academic year', () => {
  const startDate = new Date('2027-09-01T00:00:00.000Z');
  assert.deepEqual(staffAssignmentTargetDates({ startDate }), { startDate, endDate: null });
});
test('enrollment defaults use target year and first active status by sort order', () => {
  const startDate = new Date('2027-09-01T00:00:00.000Z');
  assert.deepEqual(enrollmentTargetDefaults({ startDate }, [{ id: 'later', isActive: true, sortOrder: 2 }, { id: 'inactive', isActive: false, sortOrder: 0 }, { id: 'first', isActive: true, sortOrder: 1 }]), { startDate, endDate: null, isActive: true, enrollmentStatusId: 'first' });
});

const identity = { subjectId: 'subject', gradeLevelId: 'grade', nameAr: 'الوحدة', nameHe: null, isActive: true };
for (const [label, matcher] of [['Topic', topicTargetMatch], ['Skill', skillTargetMatch]] as const) {
  test(`${label} exact identity applies the 0/1/>1 policy`, () => {
    assert.equal(matcher(identity, []).action, 'CREATE');
    assert.equal(matcher(identity, [identity]).action, 'REUSE');
    assert.equal(matcher(identity, [identity, { ...identity }]).action, 'CONFLICT');
    assert.equal(matcher(identity, [{ ...identity, nameAr: 'اسم قريب' }]).action, 'CREATE');
  });
}
