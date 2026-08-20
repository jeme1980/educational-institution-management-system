import { strict as assert } from 'node:assert';
import { examSchema } from './exam.schemas';
import { studentSchema } from './student.schemas';

const student = studentSchema.parse({
  nationalId: '9000000001',
  studentStatusId: '00000000-0000-4000-8000-000000000009',
  firstNameAr: 'أحمد',
  lastNameAr: 'علي',
  birthDate: '2012-09-01T00:00:00.000Z',
  email: 'student@example.com',
  isActive: true,
});

const studentInsert = {
  institutionId: '00000000-0000-4000-8000-000000000001',
  nationalId: student.nationalId,
  studentStatusId: student.studentStatusId,
  firstNameAr: student.firstNameAr,
  lastNameAr: student.lastNameAr,
  birthDate: student.birthDate ?? null,
  email: student.email || null,
  isActive: student.isActive ?? true,
};

const exam = examSchema.parse({
  subjectId: '00000000-0000-4000-8000-000000000013',
  typeId: '00000000-0000-4000-8000-000000000014',
  titleAr: 'امتحان تجريبي',
  examDate: '2026-09-15T08:30:00.000Z',
  durationMinutes: '90',
  maxScore: '100',
});

const examInsert = {
  institutionId: '00000000-0000-4000-8000-000000000001',
  academicYearId: exam.academicYearId ?? '00000000-0000-4000-8000-000000000007',
  subjectId: exam.subjectId,
  typeId: exam.typeId,
  titleAr: exam.titleAr,
  examDate: exam.examDate,
  durationMinutes: exam.durationMinutes,
  maxScore: String(exam.maxScore ?? 0),
};

assert.equal(studentInsert.birthDate instanceof Date, true);
assert.equal(examInsert.examDate instanceof Date, true);
assert.equal(examInsert.maxScore, '100');
assert.equal(studentSchema.safeParse({ firstNameAr: '', lastNameAr: '' }).success, false);
assert.equal(examSchema.safeParse({ titleAr: 'ناقص' }).success, false);

console.log('Student and exam Zod schemas are compatible with Prisma input shapes.');
