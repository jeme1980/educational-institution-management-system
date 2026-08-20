import { strict as assert } from 'node:assert';
import { testAdminPrisma as prisma } from '../db/test-admin-prisma';

function isForeignKeyViolation(error: any): boolean {
  return error?.code === 'P2003' || /foreign key/i.test(String(error?.message || ''));
}

async function expectForeignKeyViolation(operation: Promise<unknown>, message: string) {
  try {
    await operation;
    assert.fail(message);
  } catch (error) {
    if ((error as any)?.code === 'ERR_ASSERTION') throw error;
    assert.ok(isForeignKeyViolation(error), `${message}: expected a foreign-key violation`);
  }
}

async function main() {
  const [institutionA, type, region, status, language, stage, grade, classType, composition, jobRoleLookup, questionTypeLookup] = await Promise.all([
    prisma.institution.findFirst({ select: { id: true } }),
    prisma.educationType.findFirst(),
    prisma.region.findFirst(),
    prisma.institutionStatus.findFirst(),
    prisma.language.findFirst(),
    prisma.educationStage.findFirst(),
    prisma.gradeLevel.findFirst(),
    prisma.classType.findFirst(),
    prisma.compositionType.findFirst(),
    prisma.jobRole.findFirst(),
    prisma.questionType.findFirst(),
  ]);
  assert.ok(institutionA && type && region && status && language && stage && grade && classType && composition && jobRoleLookup && questionTypeLookup, 'Required fixtures are missing');

  const marker = `phase7b3-${Date.now()}`;
  const institutionB = await prisma.institution.create({ data: { schoolCode: String(Date.now()).slice(-10), slug: marker, nameAr: 'Phase 7B-3 Fixture', typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
  const yearA = await prisma.academicYear.create({ data: { institutionId: institutionA.id, yearLabel: `${marker}-a`, startDate: new Date('2027-09-01'), endDate: new Date('2028-06-30') } });
  const yearA2 = await prisma.academicYear.create({ data: { institutionId: institutionA.id, yearLabel: `${marker}-a2`, startDate: new Date('2028-09-01'), endDate: new Date('2029-06-30') } });
  const yearB = await prisma.academicYear.create({ data: { institutionId: institutionB.id, yearLabel: `${marker}-b`, startDate: new Date('2027-09-01'), endDate: new Date('2028-06-30') } });
  const periodA = await prisma.academicPeriod.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, nameAr: `${marker}-period-a`, startDate: new Date('2027-09-01'), endDate: new Date('2028-06-30') } });
  const periodA2 = await prisma.academicPeriod.create({ data: { institutionId: institutionA.id, academicYearId: yearA2.id, nameAr: `${marker}-period-a2`, startDate: new Date('2028-09-01'), endDate: new Date('2029-06-30') } });
  const periodB = await prisma.academicPeriod.create({ data: { institutionId: institutionB.id, academicYearId: yearB.id, nameAr: `${marker}-period-b`, startDate: new Date('2027-09-01'), endDate: new Date('2028-06-30') } });
  const subjectA = await prisma.subject.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, nameAr: `${marker}-subject-a` } });
  const subjectAOther = await prisma.subject.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, nameAr: `${marker}-subject-a-other` } });
  const subjectA2 = await prisma.subject.create({ data: { institutionId: institutionA.id, academicYearId: yearA2.id, nameAr: `${marker}-subject-a2` } });
  const subjectB = await prisma.subject.create({ data: { institutionId: institutionB.id, academicYearId: yearB.id, nameAr: `${marker}-subject-b` } });
  const examTypeA = await prisma.examType.create({ data: { institutionId: institutionA.id, nameAr: `${marker}-exam-type-a` } });
  const examTypeB = await prisma.examType.create({ data: { institutionId: institutionB.id, nameAr: `${marker}-exam-type-b` } });
  const jobRoleA = await prisma.jobRole.create({ data: { institutionId: institutionA.id, nameAr: `${marker}-job-a` } });
  const jobRoleA2 = await prisma.jobRole.create({ data: { institutionId: institutionA.id, nameAr: `${marker}-job-a2` } });
  const jobRoleB = await prisma.jobRole.create({ data: { institutionId: institutionB.id, nameAr: `${marker}-job-b` } });
  const staffA = await prisma.staffMember.create({ data: { institutionId: institutionA.id, firstNameAr: 'Phase', familyNameAr: 'Staff A' } });
  const staffA2 = await prisma.staffMember.create({ data: { institutionId: institutionA.id, firstNameAr: 'Phase', familyNameAr: 'Staff A2' } });
  const staffB = await prisma.staffMember.create({ data: { institutionId: institutionB.id, firstNameAr: 'Phase', familyNameAr: 'Staff B' } });
  const assignmentA = await prisma.staffAssignment.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, staffMemberId: staffA.id, jobRoleId: jobRoleA.id, startDate: new Date('2027-09-01') } });
  const assignmentA2 = await prisma.staffAssignment.create({ data: { institutionId: institutionA.id, academicYearId: yearA2.id, staffMemberId: staffA2.id, jobRoleId: jobRoleA2.id, startDate: new Date('2028-09-01') } });
  const assignmentB = await prisma.staffAssignment.create({ data: { institutionId: institutionB.id, academicYearId: yearB.id, staffMemberId: staffB.id, jobRoleId: jobRoleB.id, startDate: new Date('2027-09-01') } });
  const classA = await prisma.class.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, stageId: stage.id, gradeLevelId: grade.id, parallelNumber: 91, classCode: `${grade.codeNumber}-91`, nameAr: `${marker}-class-a`, typeId: classType.id, compositionId: composition.id } });
  const classA2 = await prisma.class.create({ data: { institutionId: institutionA.id, academicYearId: yearA2.id, stageId: stage.id, gradeLevelId: grade.id, parallelNumber: 92, classCode: `${grade.codeNumber}-92`, nameAr: `${marker}-class-a2`, typeId: classType.id, compositionId: composition.id } });
  const classB = await prisma.class.create({ data: { institutionId: institutionB.id, academicYearId: yearB.id, stageId: stage.id, gradeLevelId: grade.id, parallelNumber: 93, classCode: `${grade.codeNumber}-93`, nameAr: `${marker}-class-b`, typeId: classType.id, compositionId: composition.id } });
  const groupA = await prisma.studyGroup.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, classId: classA.id, subjectId: subjectA.id, staffAssignmentId: assignmentA.id, nameAr: `${marker}-group-a` } });
  const groupA2 = await prisma.studyGroup.create({ data: { institutionId: institutionA.id, academicYearId: yearA2.id, classId: classA2.id, subjectId: subjectA2.id, staffAssignmentId: assignmentA2.id, nameAr: `${marker}-group-a2` } });
  const groupAOther = await prisma.studyGroup.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, classId: classA.id, subjectId: subjectAOther.id, staffAssignmentId: assignmentA.id, nameAr: `${marker}-group-a-other` } });
  const groupB = await prisma.studyGroup.create({ data: { institutionId: institutionB.id, academicYearId: yearB.id, classId: classB.id, subjectId: subjectB.id, staffAssignmentId: assignmentB.id, nameAr: `${marker}-group-b` } });
  const examA = await prisma.exam.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, academicPeriodId: periodA.id, subjectId: subjectA.id, examTypeId: examTypeA.id, titleAr: `${marker}-exam-a`, examDate: new Date('2028-01-01'), maxScore: 100 } });
  const examA2 = await prisma.exam.create({ data: { institutionId: institutionA.id, academicYearId: yearA2.id, academicPeriodId: periodA2.id, subjectId: subjectA2.id, examTypeId: examTypeA.id, titleAr: `${marker}-exam-a2`, examDate: new Date('2028-10-01'), maxScore: 100 } });
  const examB = await prisma.exam.create({ data: { institutionId: institutionB.id, academicYearId: yearB.id, academicPeriodId: periodB.id, subjectId: subjectB.id, examTypeId: examTypeB.id, titleAr: `${marker}-exam-b`, examDate: new Date('2028-01-01'), maxScore: 100 } });
  const questionTypeA = await prisma.questionType.create({ data: { institutionId: institutionA.id, nameAr: `${marker}-question-a` } });
  let validLinkId: string | undefined;
  let mismatchYearLinkId: string | undefined;
  let mismatchSubjectLinkId: string | undefined;
  let questionId: string | undefined;

  try {
    const validLink = await prisma.examStudyGroup.create({ data: { institutionId: institutionA.id, examId: examA.id, studyGroupId: groupA.id } });
    validLinkId = validLink.id;
    await expectForeignKeyViolation(prisma.studyGroup.create({ data: { institutionId: institutionA.id, academicYearId: yearB.id, classId: classA.id, subjectId: subjectA.id, staffAssignmentId: assignmentA.id, nameAr: `${marker}-invalid-year` } }), 'StudyGroup with a foreign-institution academic year must be blocked');
    await expectForeignKeyViolation(prisma.studyGroup.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, classId: classA.id, subjectId: subjectB.id, staffAssignmentId: assignmentA.id, nameAr: `${marker}-invalid-subject` } }), 'StudyGroup with a foreign-institution subject must be blocked');
    await expectForeignKeyViolation(prisma.studyGroup.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, classId: classA.id, subjectId: subjectA2.id, staffAssignmentId: assignmentA.id, nameAr: `${marker}-invalid-subject-year` } }), 'StudyGroup with a subject from another academic year must be blocked');
    await expectForeignKeyViolation(prisma.studyGroup.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, classId: classB.id, subjectId: subjectA.id, staffAssignmentId: assignmentA.id, nameAr: `${marker}-invalid-class` } }), 'StudyGroup with a foreign-institution class must be blocked');
    await expectForeignKeyViolation(prisma.studyGroup.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, classId: classA2.id, subjectId: subjectA.id, staffAssignmentId: assignmentA.id, nameAr: `${marker}-invalid-class-year` } }), 'StudyGroup with a class from another academic year must be blocked');
    await expectForeignKeyViolation(prisma.studyGroup.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, classId: classA.id, subjectId: subjectA.id, staffAssignmentId: assignmentB.id, nameAr: `${marker}-invalid-staff` } }), 'StudyGroup with a foreign-institution staff assignment must be blocked');
    await expectForeignKeyViolation(prisma.studyGroup.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, classId: classA.id, subjectId: subjectA.id, staffAssignmentId: assignmentA2.id, nameAr: `${marker}-invalid-staff-year` } }), 'StudyGroup with a staff assignment from another academic year must be blocked');

    await expectForeignKeyViolation(prisma.exam.create({ data: { institutionId: institutionA.id, academicYearId: yearB.id, academicPeriodId: periodA.id, subjectId: subjectA.id, examTypeId: examTypeA.id, titleAr: `${marker}-invalid-exam-year`, examDate: new Date(), maxScore: 100 } }), 'Exam with a foreign-institution academic year must be blocked');
    await expectForeignKeyViolation(prisma.exam.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, academicPeriodId: periodA2.id, subjectId: subjectA.id, examTypeId: examTypeA.id, titleAr: `${marker}-invalid-exam-period`, examDate: new Date(), maxScore: 100 } }), 'Exam with a period from another academic year must be blocked');
    await expectForeignKeyViolation(prisma.exam.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, academicPeriodId: periodA.id, subjectId: subjectB.id, examTypeId: examTypeA.id, titleAr: `${marker}-invalid-exam-subject`, examDate: new Date(), maxScore: 100 } }), 'Exam with a foreign-institution subject must be blocked');
    await expectForeignKeyViolation(prisma.exam.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, academicPeriodId: periodA.id, subjectId: subjectA2.id, examTypeId: examTypeA.id, titleAr: `${marker}-invalid-exam-subject-year`, examDate: new Date(), maxScore: 100 } }), 'Exam with a subject from another academic year must be blocked');
    await expectForeignKeyViolation(prisma.exam.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, academicPeriodId: periodA.id, subjectId: subjectA.id, examTypeId: examTypeB.id, titleAr: `${marker}-invalid-exam-type`, examDate: new Date(), maxScore: 100 } }), 'Exam with a foreign-institution exam type must be blocked');

    await expectForeignKeyViolation(prisma.examStudyGroup.create({ data: { institutionId: institutionA.id, examId: examA.id, studyGroupId: groupB.id } }), 'ExamStudyGroup with a foreign-institution group must be blocked');
    const mismatchYearLink = await prisma.examStudyGroup.create({ data: { institutionId: institutionA.id, examId: examA.id, studyGroupId: groupA2.id } });
    mismatchYearLinkId = mismatchYearLink.id;
    const mismatchSubjectLink = await prisma.examStudyGroup.create({ data: { institutionId: institutionA.id, examId: examA.id, studyGroupId: groupAOther.id } });
    mismatchSubjectLinkId = mismatchSubjectLink.id;
    await expectForeignKeyViolation(
      prisma.examQuestion.create({ data: { institutionId: institutionA.id, examId: examB.id, questionTypeId: questionTypeA.id, questionNumber: 1, maxScore: 10 } }),
      'ExamQuestion with a foreign-institution exam must be blocked',
    );
  } finally {
    if (questionId) await prisma.examQuestion.delete({ where: { id: questionId } });
    if (mismatchSubjectLinkId) await prisma.examStudyGroup.delete({ where: { id: mismatchSubjectLinkId } });
    if (mismatchYearLinkId) await prisma.examStudyGroup.delete({ where: { id: mismatchYearLinkId } });
    if (validLinkId) await prisma.examStudyGroup.delete({ where: { id: validLinkId } });
    await prisma.exam.deleteMany({ where: { id: { in: [examA.id, examA2.id, examB.id] } } });
    await prisma.studyGroup.deleteMany({ where: { id: { in: [groupA.id, groupA2.id, groupAOther.id, groupB.id] } } });
    await prisma.staffAssignment.deleteMany({ where: { id: { in: [assignmentA.id, assignmentA2.id, assignmentB.id] } } });
    await prisma.staffMember.deleteMany({ where: { id: { in: [staffA.id, staffA2.id, staffB.id] } } });
    await prisma.jobRole.deleteMany({ where: { id: { in: [jobRoleA.id, jobRoleA2.id, jobRoleB.id] } } });
    await prisma.class.deleteMany({ where: { id: { in: [classA.id, classA2.id, classB.id] } } });
    await prisma.subject.deleteMany({ where: { id: { in: [subjectA.id, subjectAOther.id, subjectA2.id, subjectB.id] } } });
    await prisma.examType.deleteMany({ where: { id: { in: [examTypeA.id, examTypeB.id] } } });
    await prisma.questionType.delete({ where: { id: questionTypeA.id } });
    await prisma.academicPeriod.deleteMany({ where: { id: { in: [periodA.id, periodA2.id, periodB.id] } } });
    await prisma.academicYear.deleteMany({ where: { id: { in: [yearA.id, yearA2.id, yearB.id] } } });
    await prisma.institution.delete({ where: { id: institutionB.id } });
  }
  console.log('Phase 7B-3 database integrity tests passed. ExamStudyGroup year/subject equality remains a documented schema gap.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
