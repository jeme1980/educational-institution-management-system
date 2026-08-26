import { prisma } from './prisma';
import { bootstrapSystemData, systemIds } from './system-bootstrap';

const ids = {
  institution: '00000000-0000-4000-8000-000000000001',
  academicYear: '00000000-0000-4000-8000-000000000007',
  period: '00000000-0000-4000-8000-000000000013',
  examType: '00000000-0000-4000-8000-000000000015',
  questionType: '00000000-0000-4000-8000-000000000017',
} as const;

const id = (kind: string, number: number): string => `10000000-0000-4000-8000-${kind}${String(number).padStart(8, '0')}`;

function assertSafeEnvironment(): void {
  if (process.env['NODE_ENV'] === 'production') throw new Error('Demo seed is disabled when NODE_ENV=production.');
  if (process.env['DEMO_SEED_CONFIRM'] !== 'school-analytics') throw new Error('Set DEMO_SEED_CONFIRM=school-analytics to run the isolated demo seed.');
  const configuredUrl = process.env['RLS_RUNTIME_DATABASE_URL'] || process.env['DATABASE_URL'];
  if (!configuredUrl) throw new Error('DATABASE_URL is required for the demo seed.');
  const host = new URL(configuredUrl).hostname.toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('Demo seed only allows a local database host.');
}

export async function seedSchoolAnalyticsDemo(): Promise<void> {
  assertSafeEnvironment();
  await bootstrapSystemData(prisma);
  const db = prisma as any;
  const institution = await db.institution.findUnique({ where: { id: ids.institution } });
  const year = await db.academicYear.findUnique({ where: { id: ids.academicYear } });
  if (!institution || !year) throw new Error('Base development seed is missing. Run the explicit development seed first.');

  const gradeIds = [
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000103',
  ];
  const subjects = [
    { id: id('1001', 1), nameAr: 'الرياضيات' },
    { id: id('1001', 2), nameAr: 'اللغة العربية' },
    { id: id('1001', 3), nameAr: 'العلوم' },
  ];
  for (const subject of subjects) await db.subject.upsert({ where: { id: subject.id }, update: { nameAr: subject.nameAr, isActive: true, archivedAt: null }, create: { ...subject, institutionId: ids.institution, academicYearId: ids.academicYear } });

  const classes = [] as any[];
  for (let index = 0; index < 3; index += 1) {
    const row = { id: id('1002', index + 1), institutionId: ids.institution, academicYearId: ids.academicYear, stageId: systemIds.educationStage, gradeLevelId: gradeIds[index], parallelNumber: 1, classCode: `DEMO-${index + 1}`, nameAr: `الصف التجريبي ${index + 1}`, typeId: systemIds.classType, compositionId: systemIds.compositionType };
    classes.push(row);
    await db.class.upsert({ where: { id: row.id }, update: { nameAr: row.nameAr, archivedAt: null }, create: row });
  }

  const students = [] as any[];
  const enrollments = [] as any[];
  for (let index = 0; index < 15; index += 1) {
    const student = { id: id('1003', index + 1), institutionId: ids.institution, studentStatusId: systemIds.studentStatus, genderId: index % 2 ? systemIds.genderFemale : systemIds.genderMale, nationalId: `9${String(index + 1).padStart(9, '0')}`, firstNameAr: index % 2 ? 'سارة' : 'أحمد', lastNameAr: `طالب تجريبي ${index + 1}`, isActive: true };
    const enrollment = { id: id('1013', index + 1), institutionId: ids.institution, academicYearId: ids.academicYear, studentId: student.id, classId: classes[index % classes.length].id, enrollmentStatusId: systemIds.enrollmentStatus, startDate: new Date('2025-09-01'), isActive: true, isDeleted: false };
    students.push(student); enrollments.push(enrollment);
    await db.student.upsert({ where: { id: student.id }, update: { firstNameAr: student.firstNameAr, lastNameAr: student.lastNameAr, isActive: true }, create: student });
    await db.studentEnrollment.upsert({ where: { id: enrollment.id }, update: { classId: enrollment.classId, isActive: true, isDeleted: false }, create: enrollment });
  }

  const groups = [] as any[];
  for (let subjectIndex = 0; subjectIndex < subjects.length; subjectIndex += 1) {
    for (let groupIndex = 0; groupIndex < classes.length; groupIndex += 1) {
      const group = { id: id('1004', subjectIndex * 3 + groupIndex + 1), institutionId: ids.institution, academicYearId: ids.academicYear, classId: classes[groupIndex].id, subjectId: subjects[subjectIndex].id, nameAr: `${classes[groupIndex].nameAr} — ${subjects[subjectIndex].nameAr}`, isActive: true };
      groups.push(group);
      await db.studyGroup.upsert({ where: { id: group.id }, update: { nameAr: group.nameAr, isActive: true, archivedAt: null }, create: group });
      await db.studyGroupStudent.createMany({ data: students.filter((_, studentIndex) => studentIndex % 3 === groupIndex).map((student: any) => ({ institutionId: ids.institution, studyGroupId: group.id, studentEnrollmentId: enrollments.find((item: any) => item.studentId === student.id).id })), skipDuplicates: true });
    }
  }

  for (let subjectIndex = 0; subjectIndex < subjects.length; subjectIndex += 1) {
    for (let dimensionIndex = 0; dimensionIndex < 2; dimensionIndex += 1) {
      const topic = { id: id('1007', subjectIndex * 2 + dimensionIndex + 1), institutionId: ids.institution, academicYearId: ids.academicYear, subjectId: subjects[subjectIndex].id, gradeLevelId: gradeIds[subjectIndex], nameAr: `موضوع ${dimensionIndex + 1}`, isActive: true };
      await db.topic.upsert({ where: { id: topic.id }, update: { nameAr: topic.nameAr, isActive: true, archivedAt: null }, create: topic });
      const skill = { id: id('1008', subjectIndex * 2 + dimensionIndex + 1), institutionId: ids.institution, academicYearId: ids.academicYear, subjectId: subjects[subjectIndex].id, gradeLevelId: gradeIds[subjectIndex], nameAr: `مهارة ${dimensionIndex + 1} — ${subjects[subjectIndex].nameAr}`, isActive: true };
      await db.skill.upsert({ where: { id: skill.id }, update: { nameAr: skill.nameAr, isActive: true, archivedAt: null }, create: skill });
    }
  }

  const exams = [] as any[];
  for (let subjectIndex = 0; subjectIndex < subjects.length; subjectIndex += 1) {
    for (let examIndex = 0; examIndex < 3; examIndex += 1) {
      const exam = { id: id('1005', subjectIndex * 3 + examIndex + 1), institutionId: ids.institution, academicYearId: ids.academicYear, academicPeriodId: ids.period, subjectId: subjects[subjectIndex].id, examTypeId: ids.examType, titleAr: `${subjects[subjectIndex].nameAr} — قياس ${examIndex + 1}`, examDate: new Date(`2025-${String(10 + examIndex).padStart(2, '0')}-15`), maxScore: 100, isPublished: true };
      exams.push(exam);
      await db.exam.upsert({ where: { id: exam.id }, update: { titleAr: exam.titleAr, examDate: exam.examDate, isPublished: true, archivedAt: null }, create: exam });
      const subjectGroups = groups.filter((group: any) => group.subjectId === exam.subjectId);
      await db.examStudyGroup.createMany({ data: subjectGroups.map((group: any) => ({ institutionId: ids.institution, examId: exam.id, studyGroupId: group.id })), skipDuplicates: true });
      for (let questionIndex = 0; questionIndex < 4; questionIndex += 1) {
        const questionId = id('1006', (subjectIndex * 3 + examIndex) * 4 + questionIndex + 1);
        await db.examQuestion.upsert({ where: { examId_questionNumber: { examId: exam.id, questionNumber: questionIndex + 1 } }, update: { contentAr: `سؤال تجريبي ${questionIndex + 1}`, maxScore: 25, skillId: id('1008', subjectIndex * 2 + (questionIndex % 2) + 1), topicId: id('1007', subjectIndex * 2 + (questionIndex % 2) + 1) }, create: { id: questionId, institutionId: ids.institution, examId: exam.id, questionTypeId: ids.questionType, questionNumber: questionIndex + 1, maxScore: 25, contentAr: `سؤال تجريبي ${questionIndex + 1}`, skillId: id('1008', subjectIndex * 2 + (questionIndex % 2) + 1), topicId: id('1007', subjectIndex * 2 + (questionIndex % 2) + 1) } });
      }
      for (const student of students) {
        const groupIndex = students.findIndex((item: any) => item.id === student.id) % 3;
        const subjectGroup = subjectGroups[groupIndex];
        if (!subjectGroup) continue;
        const score = examIndex === 0 ? 45 + groupIndex * 10 : examIndex === 1 ? 58 + groupIndex * 10 : 70 + groupIndex * 8;
        await db.studentExamResult.upsert({ where: { examId_studentId: { examId: exam.id, studentId: student.id } }, update: { totalScore: score, isAbsence: examIndex === 0 && groupIndex === 2 }, create: { institutionId: ids.institution, examId: exam.id, studentId: student.id, totalScore: score, isAbsence: examIndex === 0 && groupIndex === 2 } });
      }
    }
  }

  const baseline = exams[0];
  const intervention = { id: id('1009', 1), institutionId: ids.institution, academicYearId: ids.academicYear, subjectId: subjects[0].id, studyGroupId: groups[0].id, baselineExamId: baseline.id, title: 'خطة دعم مهارات القياس', activity: 'تدريب متدرج ومتابعة أسبوعية', plannedDuration: '4 أسابيع', startDate: new Date('2026-01-10'), successCriterion: { targetMasteryPercentage: 70 }, status: 'active' };
  await db.intervention.upsert({ where: { id: intervention.id }, update: intervention, create: intervention });
  await db.interventionStudent.createMany({ data: enrollments.filter((_: any, index: number) => index % 3 === 0).map((item: any) => ({ institutionId: ids.institution, interventionId: intervention.id, studentEnrollmentId: item.id })), skipDuplicates: true });
  await db.interventionSkill.createMany({ data: [1, 2].map((number) => ({ institutionId: ids.institution, interventionId: intervention.id, skillId: id('1008', number), baselineMastery: 42, targetMastery: 70 })), skipDuplicates: true });
  console.log(`School analytics demo seed completed: ${subjects.length} subjects, ${groups.length} groups, ${students.length} students, ${exams.length} exams.`);
}
