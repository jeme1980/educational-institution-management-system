import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStaffDevelopmentAnalysis, StaffAnalysisMember, staffDevelopmentAnalysisWhere } from './staff-development-analysis.service';

const development = (id: string, startDate = '2025-03-01', endDate = '2025-03-10') => ({
  id, courseCode: `course-${id}`, courseName: `استكمال ${id}`, hoursCount: 12,
  startDate: new Date(startDate), endDate: new Date(endDate), provider: { id: 'provider-a', name: 'جهة أ' },
});

const staff: StaffAnalysisMember[] = [
  { id: 'staff-a', firstNameAr: 'أحمد', familyNameAr: 'ألف', archivedAt: null, specialization: { id: 'math', nameAr: 'رياضيات' }, developments: [development('a')] },
  { id: 'staff-b', firstNameAr: 'باسم', familyNameAr: 'باء', archivedAt: null, specialization: { id: 'math', nameAr: 'رياضيات' }, developments: [] },
  { id: 'staff-c', firstNameAr: 'جمال', familyNameAr: 'جيم', archivedAt: new Date('2025-01-01'), specialization: { id: 'science', nameAr: 'علوم' }, developments: [development('c')] },
];

test('analysis starts from active staff and includes complete zero-development rows', () => {
  const result = buildStaffDevelopmentAnalysis(staff, 'all');
  assert.equal(result.summary.activeStaff, 2);
  assert.equal(result.summary.participatingStaff, 1);
  assert.equal(result.summary.nonParticipatingStaff, 1);
  assert.equal(result.summary.participatingStaff + result.summary.nonParticipatingStaff, result.summary.activeStaff);
  assert.equal(result.rows[0].staffId, 'staff-b');
  assert.deepEqual(result.rows[0], {
    staffId: 'staff-b', firstNameAr: 'باسم', familyNameAr: 'باء', specialization: { id: 'math', nameAr: 'رياضيات' }, participated: false,
    developmentCount: 0, totalHours: 0, lastDevelopmentDate: null, lastDevelopmentName: null, lastProvider: null,
  });
  assert.equal(result.rows.some((row) => row.staffId === 'staff-c'), false);
});

test('participation filters return only matching staff rows', () => {
  assert.deepEqual(buildStaffDevelopmentAnalysis(staff, 'participated').rows.map((row) => row.staffId), ['staff-a']);
  assert.deepEqual(buildStaffDevelopmentAnalysis(staff, 'not_participated').rows.map((row) => row.staffId), ['staff-b']);
});

test('an old development makes the employee non-participating inside a later date range', () => {
  const result = buildStaffDevelopmentAnalysis(staff, 'not_participated', { startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') });
  assert.deepEqual(result.rows.map((row) => row.staffId), ['staff-a', 'staff-b']);
  assert.ok(result.rows.every((row) => row.developmentCount === 0 && !row.participated));
  assert.equal(result.summary.participatingStaff, 0);
  assert.equal(result.summary.nonParticipatingStaff, 2);
});

test('specialization-scoped staff still includes a non-participant', () => {
  const mathStaff = staff.filter((item) => item.specialization?.id === 'math');
  const result = buildStaffDevelopmentAnalysis(mathStaff, 'all');
  assert.deepEqual(result.rows.map((row) => row.staffId), ['staff-b', 'staff-a']);
});

test('query contract scopes both staff and developments to the current tenant and uses overlap dates', () => {
  const startDate = new Date('2026-01-01'); const endDate = new Date('2026-12-31');
  const where = staffDevelopmentAnalysisWhere('institution-a', { participationStatus: 'all', specializationId: 'math', startDate, endDate });
  assert.equal(where.staffWhere.institutionId, 'institution-a');
  assert.equal(where.staffWhere.archivedAt, null);
  assert.equal(where.staffWhere.specializationId, 'math');
  assert.equal(where.developmentWhere.institutionId, 'institution-a');
  assert.deepEqual(where.developmentWhere.startDate, { lte: endDate });
  assert.deepEqual(where.developmentWhere.endDate, { gte: startDate });
});
