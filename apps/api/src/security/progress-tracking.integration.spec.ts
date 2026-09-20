import assert from 'node:assert/strict';
import { getProgressTracking, getProgressTrackingDimensions, getProgressTrackingStudyGroups, getStudentProgressTracking } from '../controllers/progress-tracking.controller';
import { getSubjects } from '../controllers/subjects.controller';
import { testAdminPrisma as prisma } from '../db/test-admin-prisma';
import { withRlsContext } from '../middleware/rls-request.middleware';

const marker = `progress-fixture-${Date.now()}`;

async function responseFor(query: Record<string, string>, institutionId: string, academicYearId: string, student = false) {
  let statusCode = 200;
  let body: any;
  const response = {
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { body = value; return this; },
  } as any;
  await withRlsContext(institutionId, () => (student ? getStudentProgressTracking : getProgressTracking)({ context: { institutionId, academicYearId }, query } as any, response));
  return { statusCode, body };
}

async function studyGroupsResponse(query: Record<string, string>, institutionId: string, academicYearId: string) {
  let statusCode = 200;
  let body: any;
  const response = {
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { body = value; return this; },
  } as any;
  await withRlsContext(institutionId, () => getProgressTrackingStudyGroups({ context: { institutionId, academicYearId }, query } as any, response));
  return { statusCode, body };
}

async function dimensionsResponse(query: Record<string, string>, institutionId: string, academicYearId: string) {
  let statusCode = 200;
  let body: any;
  const response = {
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { body = value; return this; },
  } as any;
  await withRlsContext(institutionId, () => getProgressTrackingDimensions({ context: { institutionId, academicYearId }, query } as any, response));
  return { statusCode, body };
}

async function subjectsResponse(query: Record<string, string>, institutionId: string, academicYearId: string) {
  let statusCode = 200;
  let body: any;
  const response = {
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { body = value; return this; },
  } as any;
  await withRlsContext(institutionId, () => getSubjects({ context: { institutionId, academicYearId }, query } as any, response));
  return { statusCode, body };
}

async function main() {
  const [type, region, status, language, stage, grade, classType, composition, studentStatus, enrollmentStatus, gender, permission] = await Promise.all([
    prisma.educationType.findFirstOrThrow(),
    prisma.region.findFirstOrThrow(),
    prisma.institutionStatus.findFirstOrThrow(),
    prisma.language.findFirstOrThrow(),
    prisma.educationStage.findFirstOrThrow(),
    prisma.gradeLevel.findFirstOrThrow(),
    prisma.classType.findFirstOrThrow(),
    prisma.compositionType.findFirstOrThrow(),
    prisma.studentStatus.findFirstOrThrow(),
    prisma.enrollmentStatus.findFirstOrThrow(),
    prisma.gender.findFirstOrThrow(),
    prisma.permission.upsert({ where: { module_action: { module: 'exams', action: 'READ' } }, update: { isActive: true }, create: { module: 'exams', action: 'READ', nameAr: 'Progress fixture read' } }),
  ]);
  const otherGrade = await prisma.gradeLevel.findFirstOrThrow({ where: { id: { not: grade.id } } });

  const tracked = { exams: [] as string[], results: [] as string[], links: [] as string[], groups: [] as string[], memberships: [] as string[], enrollments: [] as string[], students: [] as string[], periods: [] as string[], subjects: [] as string[], classes: [] as string[], years: [] as string[], institutions: [] as string[], questionTypes: [] as string[], questions: [] as string[], questionScores: [] as string[], skills: [] as string[], topics: [] as string[] };
  const institutionA = await prisma.institution.create({ data: { schoolCode: `${String(Date.now()).slice(-10)}`, slug: `${marker}-a`, nameAr: 'Progress Fixture A', typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
  const institutionB = await prisma.institution.create({ data: { schoolCode: `${String(Date.now() + 1).slice(-10)}`, slug: `${marker}-b`, nameAr: 'Progress Fixture B', typeId: type.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
  tracked.institutions.push(institutionA.id, institutionB.id);

  try {
    const yearA = await prisma.academicYear.create({ data: { institutionId: institutionA.id, yearLabel: `${marker}-a`, startDate: new Date('2027-09-01'), endDate: new Date('2028-06-30'), isCurrent: true } });
    const yearB = await prisma.academicYear.create({ data: { institutionId: institutionB.id, yearLabel: `${marker}-b`, startDate: new Date('2027-09-01'), endDate: new Date('2028-06-30'), isCurrent: true } });
    tracked.years.push(yearA.id, yearB.id);
    const periodA = await prisma.academicPeriod.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, nameAr: `${marker} period`, startDate: yearA.startDate, endDate: yearA.endDate } });
    tracked.periods.push(periodA.id);
    const subjectA = await prisma.subject.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, nameAr: `${marker} subject` } });
    const subjectB = await prisma.subject.create({ data: { institutionId: institutionB.id, academicYearId: yearB.id, nameAr: `${marker} subject B` } });
    tracked.subjects.push(subjectA.id, subjectB.id);
    const classA = await prisma.class.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, stageId: stage.id, gradeLevelId: grade.id, parallelNumber: 991, classCode: `${grade.codeNumber}-991`, nameAr: `${marker} class`, typeId: classType.id, compositionId: composition.id } });
    const classSameGrade = await prisma.class.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, stageId: stage.id, gradeLevelId: grade.id, parallelNumber: 992, classCode: `${grade.codeNumber}-992`, nameAr: `${marker} class same grade`, typeId: classType.id, compositionId: composition.id } });
    const classOtherGrade = await prisma.class.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, stageId: stage.id, gradeLevelId: otherGrade.id, parallelNumber: 993, classCode: `${otherGrade.codeNumber}-993`, nameAr: `${marker} class other grade`, typeId: classType.id, compositionId: composition.id } });
    tracked.classes.push(classA.id, classSameGrade.id, classOtherGrade.id);
    const groupA = await prisma.studyGroup.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, subjectId: subjectA.id, classId: classA.id, nameAr: `${marker} group` } });
    const groupSameGrade = await prisma.studyGroup.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, subjectId: subjectA.id, classId: classSameGrade.id, nameAr: `${marker} group same grade` } });
    const groupOtherGrade = await prisma.studyGroup.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, subjectId: subjectA.id, classId: classOtherGrade.id, nameAr: `${marker} group other grade` } });
    const groupB = await prisma.studyGroup.create({ data: { institutionId: institutionB.id, academicYearId: yearB.id, subjectId: subjectB.id, nameAr: `${marker} group B` } });
    tracked.groups.push(groupA.id, groupSameGrade.id, groupOtherGrade.id, groupB.id);

    const students = await Promise.all([1, 2, 3].map((index) => prisma.student.create({ data: { institutionId: institutionA.id, nationalId: `${String(Date.now()).slice(-7)}${index}`, studentStatusId: studentStatus.id, genderId: gender.id, firstNameAr: `${marker} student`, lastNameAr: String(index) } })));
    tracked.students.push(...students.map((student) => student.id));
    const enrollments = await Promise.all(students.map((student, index) => prisma.studentEnrollment.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, studentId: student.id, classId: classA.id, enrollmentStatusId: enrollmentStatus.id, enrollmentNumber: `${marker}-${index}`, startDate: yearA.startDate } })));
    tracked.enrollments.push(...enrollments.map((enrollment) => enrollment.id));
    const groupMemberships = await Promise.all(enrollments.map((enrollment) => prisma.studyGroupStudent.create({ data: { institutionId: institutionA.id, studyGroupId: groupA.id, studentEnrollmentId: enrollment.id } })));
    tracked.memberships.push(...groupMemberships.map((membership) => membership.id));
    const aggregateStudent = await prisma.student.create({ data: { institutionId: institutionA.id, nationalId: `${String(Date.now()).slice(-7)}9`, studentStatusId: studentStatus.id, genderId: gender.id, firstNameAr: `${marker} aggregate`, lastNameAr: 'student' } });
    tracked.students.push(aggregateStudent.id);
    const aggregateEnrollment = await prisma.studentEnrollment.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, studentId: aggregateStudent.id, classId: classSameGrade.id, enrollmentStatusId: enrollmentStatus.id, enrollmentNumber: `${marker}-aggregate`, startDate: yearA.startDate } });
    tracked.enrollments.push(aggregateEnrollment.id);
    const aggregateMembership = await prisma.studyGroupStudent.create({ data: { institutionId: institutionA.id, studyGroupId: groupSameGrade.id, studentEnrollmentId: aggregateEnrollment.id } });
    tracked.memberships.push(aggregateMembership.id);

    const examType = await prisma.examType.create({ data: { institutionId: institutionA.id, nameAr: `${marker} exam type` } });
    const makeExam = (titleAr: string, examDate: string, maxScore: number, archivedAt: Date | null = null) => prisma.exam.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, academicPeriodId: periodA.id, subjectId: subjectA.id, examTypeId: examType.id, titleAr, examDate: new Date(examDate), maxScore, isPublished: true, archivedAt } });
    const exam1 = await makeExam(`${marker} exam 1`, '2027-10-01', 20);
    const exam2 = await makeExam(`${marker} exam 2`, '2027-11-01', 50);
    const exam3 = await makeExam(`${marker} exam 3`, '2027-12-01', 100);
    const archived = await makeExam(`${marker} archived`, '2027-12-15', 20, new Date('2028-01-01'));
    const otherGradeExam = await makeExam(`${marker} other grade exam`, '2027-12-20', 20);
    tracked.exams.push(exam1.id, exam2.id, exam3.id, archived.id, otherGradeExam.id);
    for (const exam of [exam1, exam2, exam3, archived]) {
      const link = await prisma.examStudyGroup.create({ data: { institutionId: institutionA.id, examId: exam.id, studyGroupId: groupA.id } });
      tracked.links.push(link.id);
    }
    for (const [examId, studyGroupId] of [[exam1.id, groupSameGrade.id], [otherGradeExam.id, groupOtherGrade.id]]) {
      const link = await prisma.examStudyGroup.create({ data: { institutionId: institutionA.id, examId, studyGroupId } });
      tracked.links.push(link.id);
    }
    const resultInputs = [
      [exam1, [10, 15, null]], [exam2, [35, 40, 25]], [exam3, [80, 90, null]],
    ] as const;
    for (const [exam, scores] of resultInputs) {
      for (const [index, score] of scores.entries()) {
        if (score === null && exam === exam1) {
          const result = await prisma.studentExamResult.create({ data: { institutionId: institutionA.id, examId: exam.id, studentId: students[index].id, totalScore: 0, isAbsence: true } });
          tracked.results.push(result.id);
        } else if (score !== null) {
          const result = await prisma.studentExamResult.create({ data: { institutionId: institutionA.id, examId: exam.id, studentId: students[index].id, totalScore: score } });
          tracked.results.push(result.id);
        }
      }
    }
    const aggregateResult = await prisma.studentExamResult.create({ data: { institutionId: institutionA.id, examId: exam1.id, studentId: aggregateStudent.id, totalScore: 20 } });
    tracked.results.push(aggregateResult.id);

    const questionType = await prisma.questionType.create({ data: { institutionId: institutionA.id, nameAr: `${marker} question type` } });
    tracked.questionTypes.push(questionType.id);
    const skill1 = await prisma.skill.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, subjectId: subjectA.id, gradeLevelId: grade.id, nameAr: `${marker} same name` } });
    const skill2 = await prisma.skill.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, subjectId: subjectA.id, gradeLevelId: grade.id, nameAr: `${marker} same name` } });
    const topic1 = await prisma.topic.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, subjectId: subjectA.id, gradeLevelId: grade.id, nameAr: `${marker} topic one` } });
    const topic2 = await prisma.topic.create({ data: { institutionId: institutionA.id, academicYearId: yearA.id, subjectId: subjectA.id, gradeLevelId: grade.id, nameAr: `${marker} topic two` } });
    tracked.skills.push(skill1.id, skill2.id); tracked.topics.push(topic1.id, topic2.id);
    const questionInputs = [
      [exam1, skill1, topic1], [exam2, skill1, topic2], [exam2, skill2, topic1], [exam3, skill2, topic2],
    ] as const;
    const questions = [] as { id: string; examId: string }[];
    for (const [index, [exam, skill, topic]] of questionInputs.entries()) {
      const question = await prisma.examQuestion.create({ data: { institutionId: institutionA.id, examId: exam.id, questionTypeId: questionType.id, skillId: skill.id, topicId: topic.id, questionNumber: index + 1, maxScore: 10 } });
      questions.push(question); tracked.questions.push(question.id);
    }
    const scoreInputs = [
      [questions[0], 8, 6], [questions[1], 9, 7, 5], [questions[2], 8, 6, 4], [questions[3], 9, 7],
    ] as const;
    for (const [question, ...studentScores] of scoreInputs) {
      for (const [index, score] of studentScores.entries()) {
        const saved = await prisma.studentQuestionScore.create({ data: { institutionId: institutionA.id, examQuestionId: question.id, studentId: students[index].id, score } });
        tracked.questionScores.push(saved.id);
      }
    }

    const fixtureContext = await Promise.all([
      prisma.academicYear.findFirst({ where: { id: yearA.id, institutionId: institutionA.id, archivedAt: null } }),
      prisma.subject.findFirst({ where: { id: subjectA.id, institutionId: institutionA.id, academicYearId: yearA.id, archivedAt: null, isActive: true } }),
      prisma.studyGroup.findFirst({ where: { id: groupA.id, institutionId: institutionA.id, academicYearId: yearA.id, subjectId: subjectA.id, archivedAt: null, isActive: true } }),
    ]);
    assert.deepEqual(fixtureContext.map(Boolean), [true, true, true]);

    const availableGroups = await studyGroupsResponse({ academicYearId: yearA.id, subjectId: subjectA.id }, institutionA.id, yearA.id);
    assert.equal(availableGroups.statusCode, 200, JSON.stringify(availableGroups.body));
    assert.deepEqual(new Set(availableGroups.body.map((group: any) => group.id)), new Set([groupA.id, groupSameGrade.id, groupOtherGrade.id]));
    assert.equal(availableGroups.body.find((group: any) => group.id === groupA.id).classRoom.gradeLevel.id, grade.id);
    const foreignGroups = await studyGroupsResponse({ academicYearId: yearA.id, subjectId: subjectB.id }, institutionA.id, yearA.id);
    assert.equal(foreignGroups.statusCode, 404);

    const yearSubjects = await subjectsResponse({ academicYearId: yearA.id }, institutionA.id, yearA.id);
    assert.equal(yearSubjects.statusCode, 200, JSON.stringify(yearSubjects.body));
    assert.deepEqual(yearSubjects.body.map((subject: any) => subject.id), [subjectA.id]);
    const foreignYearSubjects = await subjectsResponse({ academicYearId: yearB.id }, institutionA.id, yearA.id);
    assert.equal(foreignYearSubjects.statusCode, 404);

    const valid = await responseFor({ academicYearId: yearA.id, subjectId: subjectA.id, gradeLevelId: grade.id, studyGroupId: groupA.id }, institutionA.id, yearA.id);
    assert.equal(valid.statusCode, 200, JSON.stringify(valid.body));
    assert.deepEqual(valid.body.points.map((point: any) => point.examName), [exam1.titleAr, exam2.titleAr, exam3.titleAr]);
    assert.deepEqual(valid.body.points.map((point: any) => point.participantCount), [2, 3, 2]);
    assert.deepEqual(valid.body.points.map((point: any) => point.averagePercentage), [62.5, 66.67, 85]);
    assert.deepEqual(valid.body.points.map((point: any) => point.passRate), [100, 100, 100]);
    assert.equal(valid.body.summary.examsCount, 3);

    const gradeAggregate = await responseFor({ academicYearId: yearA.id, subjectId: subjectA.id, gradeLevelId: grade.id }, institutionA.id, yearA.id);
    assert.equal(gradeAggregate.statusCode, 200, JSON.stringify(gradeAggregate.body));
    assert.equal(gradeAggregate.body.context.studyGroup, null);
    assert.equal(gradeAggregate.body.context.studyGroupsCount, 2);
    assert.equal(gradeAggregate.body.summary.examsCount, 3);
    assert.equal(gradeAggregate.body.points[0].averagePercentage, 75);
    assert.equal(gradeAggregate.body.points[0].participantCount, 3);
    assert.equal(gradeAggregate.body.points.filter((point: any) => point.examId === exam1.id).length, 1);
    assert.equal(gradeAggregate.body.points.some((point: any) => point.examId === otherGradeExam.id), false);

    const mismatchedGrade = await responseFor({ academicYearId: yearA.id, subjectId: subjectA.id, gradeLevelId: grade.id, studyGroupId: groupOtherGrade.id }, institutionA.id, yearA.id);
    assert.equal(mismatchedGrade.statusCode, 404);

    const studentProgress = await responseFor({ academicYearId: yearA.id, subjectId: subjectA.id, studyGroupId: groupA.id, studentId: students[2].id }, institutionA.id, yearA.id, true);
    assert.equal(studentProgress.statusCode, 200, JSON.stringify(studentProgress.body));
    assert.deepEqual(studentProgress.body.points.map((point: any) => point.participationStatus), ['absent', 'completed', 'missing']);
    assert.equal(studentProgress.body.summary.completedCount, 1);
    assert.equal(studentProgress.body.points[1].studentPercentage, 50);
    assert.equal(studentProgress.body.points[1].gapFromGroup, -16.67);
    assert.equal(studentProgress.body.points[0].studentPercentage, null);
    assert.equal(studentProgress.body.points[2].studentPercentage, null);
    assert.equal(studentProgress.body.student.id, students[2].id);
    assert.equal(studentProgress.body.points.some((point: any) => point.studentId), false);

    const skillProgress = await dimensionsResponse({ academicYearId: yearA.id, subjectId: subjectA.id, studyGroupId: groupA.id, dimension: 'skill', dimensionId: skill1.id }, institutionA.id, yearA.id);
    assert.equal(skillProgress.statusCode, 200, JSON.stringify(skillProgress.body));
    assert.equal(skillProgress.body.availableDimensions.filter((item: any) => item.name === skill1.nameAr).length, 2);
    assert.equal(skillProgress.body.selectedDimension.id, skill1.id);
    assert.deepEqual(skillProgress.body.points.map((point: any) => point.status), ['measured', 'measured', 'notMeasured']);
    assert.equal(skillProgress.body.points[0].masteryRate, 70);
    assert.equal(skillProgress.body.selectedDimension.measuredExamCount, 2);
    assert.equal(skillProgress.body.selectedDimension.totalExamCount, 3);
    assert.equal(skillProgress.body.points.some((point: any) => 'scores' in point || 'studentResults' in point), false);
    const topicProgress = await dimensionsResponse({ academicYearId: yearA.id, subjectId: subjectA.id, studyGroupId: groupA.id, dimension: 'topic', dimensionId: topic2.id }, institutionA.id, yearA.id);
    assert.equal(topicProgress.statusCode, 200, JSON.stringify(topicProgress.body));
    assert.deepEqual(topicProgress.body.points.map((point: any) => point.status), ['notMeasured', 'measured', 'measured']);
    const invalidDimension = await dimensionsResponse({ academicYearId: yearA.id, subjectId: subjectA.id, studyGroupId: groupA.id, dimension: 'skill', dimensionId: '00000000-0000-4000-8000-000000000099' }, institutionA.id, yearA.id);
    assert.equal(invalidDimension.statusCode, 404);

    for (const query of [
      { academicYearId: yearB.id, subjectId: subjectA.id, studyGroupId: groupA.id },
      { academicYearId: yearA.id, subjectId: subjectB.id, studyGroupId: groupA.id },
      { academicYearId: yearA.id, subjectId: subjectA.id, studyGroupId: groupB.id },
    ]) {
      const foreign = await responseFor({ ...query, gradeLevelId: grade.id }, institutionA.id, yearA.id);
      assert.equal(foreign.statusCode, 404);
      assert.equal(foreign.body.points, undefined);
    }
    const foreignStudent = await responseFor({ academicYearId: yearA.id, subjectId: subjectA.id, studyGroupId: groupB.id, studentId: students[2].id }, institutionA.id, yearA.id, true);
    assert.equal(foreignStudent.statusCode, 404);

    assert.equal(valid.body.points.some((point: any) => point.examName === archived.titleAr), false);
    console.log('Progress tracking isolated integration fixture passed.');
  } finally {
    await prisma.studentQuestionScore.deleteMany({ where: { id: { in: tracked.questionScores } } });
    await prisma.examQuestion.deleteMany({ where: { id: { in: tracked.questions } } });
    await prisma.studentExamResult.deleteMany({ where: { id: { in: tracked.results } } });
    await prisma.examStudyGroup.deleteMany({ where: { id: { in: tracked.links } } });
    await prisma.exam.deleteMany({ where: { id: { in: tracked.exams } } });
    await prisma.examType.deleteMany({ where: { institutionId: { in: tracked.institutions }, nameAr: { startsWith: marker } } });
    await prisma.questionType.deleteMany({ where: { id: { in: tracked.questionTypes } } });
    await prisma.skill.deleteMany({ where: { id: { in: tracked.skills } } });
    await prisma.topic.deleteMany({ where: { id: { in: tracked.topics } } });
    await prisma.studyGroupStudent.deleteMany({ where: { id: { in: tracked.memberships } } });
    await prisma.studyGroup.deleteMany({ where: { id: { in: tracked.groups } } });
    await prisma.studentEnrollment.deleteMany({ where: { id: { in: tracked.enrollments } } });
    await prisma.student.deleteMany({ where: { id: { in: tracked.students } } });
    await prisma.academicPeriod.deleteMany({ where: { id: { in: tracked.periods } } });
    await prisma.subject.deleteMany({ where: { id: { in: tracked.subjects } } });
    await prisma.class.deleteMany({ where: { id: { in: tracked.classes } } });
    await prisma.academicYear.deleteMany({ where: { id: { in: tracked.years } } });
    await prisma.institution.deleteMany({ where: { id: { in: tracked.institutions } } });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
