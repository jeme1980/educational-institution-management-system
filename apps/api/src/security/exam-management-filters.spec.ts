import { strict as assert } from 'node:assert';
import { getExams } from '../controllers/exams.controller';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';
import { withRlsContext } from '../middleware/rls-request.middleware';

async function invoke(institutionId: string, academicYearId: string) {
  let body: any;
  const response: any = { status: () => response, json: (value: any) => { body = value; return response; } };
  await withRlsContext(institutionId, () => getExams({ context: { institutionId, academicYearId } } as any, response));
  return body as any[];
}

async function main() {
  const [educationType, region, status, language, stage, grade, classType, composition] = await Promise.all([
    admin.educationType.findFirst(), admin.region.findFirst(), admin.institutionStatus.findFirst(), admin.language.findFirst(),
    admin.educationStage.findFirst(), admin.gradeLevel.findFirst(), admin.classType.findFirst(), admin.compositionType.findFirst(),
  ]);
  assert.ok(educationType && region && status && language && stage && grade && classType && composition, 'Reference fixtures are required');
  const marker = `exam-filters-${Date.now()}`;
  const institution = await admin.institution.create({ data: { schoolCode: String(Date.now()).slice(-10), slug: marker, nameAr: marker, typeId: educationType.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
  const year = await admin.academicYear.create({ data: { institutionId: institution.id, yearLabel: marker, startDate: new Date('2092-09-01'), endDate: new Date('2093-06-30') } });
  try {
    const [period, subject, examType, jobRole, teacherA, teacherB] = await Promise.all([
      admin.academicPeriod.create({ data: { institutionId: institution.id, academicYearId: year.id, nameAr: marker, startDate: new Date('2092-09-01'), endDate: new Date('2093-06-30') } }),
      admin.subject.create({ data: { institutionId: institution.id, academicYearId: year.id, nameAr: marker } }),
      admin.examType.create({ data: { institutionId: institution.id, nameAr: marker } }),
      admin.jobRole.create({ data: { institutionId: institution.id, nameAr: marker, isTeachingRole: true } }),
      admin.staffMember.create({ data: { institutionId: institution.id, firstNameAr: 'أحمد', familyNameAr: marker } }),
      admin.staffMember.create({ data: { institutionId: institution.id, firstNameAr: 'ليلى', familyNameAr: marker } }),
    ]);
    const [classA, classB, assignmentA, assignmentB] = await Promise.all([
      admin.class.create({ data: { institutionId: institution.id, academicYearId: year.id, stageId: stage.id, gradeLevelId: grade.id, parallelNumber: 91, nameAr: `${marker}-A`, typeId: classType.id, compositionId: composition.id } }),
      admin.class.create({ data: { institutionId: institution.id, academicYearId: year.id, stageId: stage.id, gradeLevelId: grade.id, parallelNumber: 92, nameAr: `${marker}-B`, typeId: classType.id, compositionId: composition.id } }),
      admin.staffAssignment.create({ data: { institutionId: institution.id, academicYearId: year.id, staffMemberId: teacherA.id, jobRoleId: jobRole.id, startDate: new Date('2092-09-01') } }),
      admin.staffAssignment.create({ data: { institutionId: institution.id, academicYearId: year.id, staffMemberId: teacherB.id, jobRoleId: jobRole.id, startDate: new Date('2092-09-01') } }),
    ]);
    const [groupA, groupB] = await Promise.all([
      admin.studyGroup.create({ data: { institutionId: institution.id, academicYearId: year.id, classId: classA.id, subjectId: subject.id, staffAssignmentId: assignmentA.id, nameAr: `${marker}-group-A` } }),
      admin.studyGroup.create({ data: { institutionId: institution.id, academicYearId: year.id, classId: classB.id, subjectId: subject.id, staffAssignmentId: assignmentB.id, nameAr: `${marker}-group-B` } }),
    ]);
    const exam = await admin.exam.create({ data: { institutionId: institution.id, academicYearId: year.id, academicPeriodId: period.id, subjectId: subject.id, examTypeId: examType.id, titleAr: marker, examDate: new Date('2092-10-01'), maxScore: 100 } });
    await admin.examStudyGroup.createMany({ data: [
      { institutionId: institution.id, examId: exam.id, studyGroupId: groupA.id },
      { institutionId: institution.id, examId: exam.id, studyGroupId: groupB.id },
    ] });

    const result = await invoke(institution.id, year.id);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, exam.id);
    assert.deepEqual(new Set(result[0].examGroups.map((link: any) => link.studyGroup.classRoom.id)), new Set([classA.id, classB.id]));
    assert.deepEqual(new Set(result[0].examGroups.map((link: any) => link.studyGroup.classRoom.gradeLevelId)), new Set([grade.id]));
    assert.deepEqual(new Set(result[0].examGroups.map((link: any) => link.studyGroup.staffAssignment.staffMemberId)), new Set([teacherA.id, teacherB.id]));
    assert.ok(result[0].examGroups.every((link: any) => link.studyGroup.staffAssignment.staffMember.firstNameAr));
  } finally {
    await admin.examStudyGroup.deleteMany({ where: { institutionId: institution.id } });
    await admin.exam.deleteMany({ where: { institutionId: institution.id } });
    await admin.studyGroup.deleteMany({ where: { institutionId: institution.id } });
    await admin.staffAssignment.deleteMany({ where: { institutionId: institution.id } });
    await admin.staffMember.deleteMany({ where: { institutionId: institution.id } });
    await admin.jobRole.deleteMany({ where: { institutionId: institution.id } });
    await admin.subject.deleteMany({ where: { institutionId: institution.id } });
    await admin.academicPeriod.deleteMany({ where: { institutionId: institution.id } });
    await admin.examType.deleteMany({ where: { institutionId: institution.id } });
    await admin.class.deleteMany({ where: { institutionId: institution.id } });
    await admin.academicYear.deleteMany({ where: { institutionId: institution.id } });
    await admin.institution.delete({ where: { id: institution.id } });
    await admin.$disconnect();
  }
  console.log('Exam management filter DTO tests passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
