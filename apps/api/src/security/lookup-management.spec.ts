import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createPublicLookup, deletePublicLookup, getPublicLookups, updatePublicLookup } from '../controllers/public-lookups.controller';
import { deleteExamTypesById, deleteQuestionTypesById, getExamTypes, getQuestionTypes } from '../controllers/exams.controller';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';
import { withRlsContext } from '../middleware/rls-request.middleware';

async function invoke(handler: (req: any, res: any) => Promise<any>, institutionId: string, params: Record<string, string> = {}, body: Record<string, unknown> = {}) {
  let statusCode = 200;
  let responseBody: any;
  const response: any = {
    status(code: number) { statusCode = code; return response; },
    json(value: any) { responseBody = value; return response; },
  };
  await withRlsContext(institutionId, () => handler({ context: { institutionId, academicYearId: '' }, params, body }, response));
  return { statusCode, body: responseBody };
}

async function main() {
  const generalRoutes = readFileSync(require.resolve('../routes/general.routes'), 'utf8');
  const examRoutes = readFileSync(require.resolve('../routes/exams.routes'), 'utf8');
  assert.match(generalRoutes, /public-lookups'.*settings', 'read'/s, 'Lookup list requires settings:read');
  assert.equal((generalRoutes.match(/public-lookups[^\n]+settings', 'update'/g) || []).length, 3, 'All generic lookup mutations require settings:update');
  assert.equal((examRoutes.match(/(?:exam|question)-types[^\n]+settings', 'update'/g) || []).length, 6, 'All legacy lookup mutations require settings:update');
  const [educationType, region, status, language] = await Promise.all([
    admin.educationType.findFirst(), admin.region.findFirst(), admin.institutionStatus.findFirst(), admin.language.findFirst(),
  ]);
  assert.ok(educationType && region && status && language, 'Global lookup fixtures are required');
  const marker = `lookup-management-${Date.now()}`;
  const institutionA = await admin.institution.create({ data: { schoolCode: String(Date.now()).slice(-10), slug: `${marker}-a`, nameAr: 'Lookup A', typeId: educationType.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
  const institutionB = await admin.institution.create({ data: { schoolCode: String(Date.now() + 1).slice(-10), slug: `${marker}-b`, nameAr: 'Lookup B', typeId: educationType.id, regionId: region.id, statusId: status.id, defaultLanguageId: language.id } });
  const year = await admin.academicYear.create({ data: { institutionId: institutionA.id, yearLabel: marker, startDate: new Date('2090-09-01'), endDate: new Date('2091-06-30') } });
  const period = await admin.academicPeriod.create({ data: { institutionId: institutionA.id, academicYearId: year.id, nameAr: marker, startDate: new Date('2090-09-01'), endDate: new Date('2091-06-30') } });
  const subject = await admin.subject.create({ data: { institutionId: institutionA.id, academicYearId: year.id, nameAr: marker } });
  let examId = '';
  let questionId = '';
  try {
    const examCreate = await invoke(createPublicLookup, institutionA.id, { table: 'examTypes' }, { nameAr: `${marker}-exam`, nameHe: 'מבחן', sortOrder: 4, isActive: true });
    assert.equal(examCreate.statusCode, 201);
    const examTypeId = examCreate.body.id as string;
    assert.equal((await invoke(createPublicLookup, institutionA.id, { table: 'examTypes' }, { nameAr: `${marker}-exam` })).statusCode, 409, 'Duplicate exam type names must be rejected');
    assert.equal((await invoke(updatePublicLookup, institutionB.id, { table: 'examTypes', id: examTypeId }, { nameAr: 'blocked' })).statusCode, 404, 'Exam type updates must be tenant-scoped');
    assert.equal((await invoke(updatePublicLookup, institutionA.id, { table: 'examTypes', id: examTypeId }, { nameAr: `${marker}-exam-updated`, isActive: true })).statusCode, 200);

    const questionCreate = await invoke(createPublicLookup, institutionA.id, { table: 'questionTypes' }, { nameAr: `${marker}-question`, sortOrder: 5, isActive: true });
    assert.equal(questionCreate.statusCode, 201);
    const questionTypeId = questionCreate.body.id as string;
    assert.equal((await invoke(createPublicLookup, institutionA.id, { table: 'questionTypes' }, { nameAr: `${marker}-question` })).statusCode, 409, 'Duplicate question type names must be rejected');
    assert.equal((await invoke(updatePublicLookup, institutionA.id, { table: 'questionTypes', id: questionTypeId }, { nameAr: `${marker}-question-updated`, isActive: true })).statusCode, 200);

    const allLookups = await invoke(getPublicLookups, institutionA.id);
    assert.ok(allLookups.body.examTypes.some((item: any) => item.id === examTypeId));
    assert.ok(allLookups.body.questionTypes.some((item: any) => item.id === questionTypeId));

    const usedExamType = await admin.examType.create({ data: { institutionId: institutionA.id, nameAr: `${marker}-used-exam` } });
    const usedQuestionType = await admin.questionType.create({ data: { institutionId: institutionA.id, nameAr: `${marker}-used-question` } });
    const exam = await admin.exam.create({ data: { institutionId: institutionA.id, academicYearId: year.id, academicPeriodId: period.id, subjectId: subject.id, examTypeId: usedExamType.id, titleAr: marker, examDate: new Date('2090-10-01'), maxScore: 10 } });
    examId = exam.id;
    const question = await admin.examQuestion.create({ data: { institutionId: institutionA.id, examId: exam.id, questionTypeId: usedQuestionType.id, questionNumber: 1, maxScore: 10 } });
    questionId = question.id;

    const usedExamDelete = await invoke(deletePublicLookup, institutionA.id, { table: 'examTypes', id: usedExamType.id });
    assert.equal(usedExamDelete.statusCode, 409);
    assert.equal(usedExamDelete.body.code, 'LOOKUP_IN_USE');
    assert.match(usedExamDelete.body.error, /مستخدم في امتحانات/);
    const usedQuestionDelete = await invoke(deletePublicLookup, institutionA.id, { table: 'questionTypes', id: usedQuestionType.id });
    assert.equal(usedQuestionDelete.statusCode, 409);
    assert.equal(usedQuestionDelete.body.code, 'LOOKUP_IN_USE');
    assert.match(usedQuestionDelete.body.error, /مستخدم في أسئلة/);
    assert.equal((await invoke(deleteExamTypesById, institutionA.id, { id: usedExamType.id })).statusCode, 409, 'Legacy exam type mutation endpoint must also block used deletion');
    assert.equal((await invoke(deleteQuestionTypesById, institutionA.id, { id: usedQuestionType.id })).statusCode, 409, 'Legacy question type mutation endpoint must also block used deletion');

    assert.equal((await invoke(deletePublicLookup, institutionA.id, { table: 'examTypes', id: examTypeId })).statusCode, 200);
    assert.equal((await admin.examType.findUniqueOrThrow({ where: { id: examTypeId } })).isActive, false, 'Unused exam type deletion follows the existing soft-delete contract');
    assert.equal((await invoke(deletePublicLookup, institutionA.id, { table: 'questionTypes', id: questionTypeId })).statusCode, 200);
    assert.equal((await admin.questionType.findUniqueOrThrow({ where: { id: questionTypeId } })).isActive, false, 'Unused question type deletion follows the existing soft-delete contract');

    const activeExamTypes = await invoke(getExamTypes, institutionA.id);
    const activeQuestionTypes = await invoke(getQuestionTypes, institutionA.id);
    assert.ok(!activeExamTypes.body.some((item: any) => item.id === examTypeId), 'Inactive exam types must disappear from exam forms');
    assert.ok(!activeQuestionTypes.body.some((item: any) => item.id === questionTypeId), 'Inactive question types must disappear from question forms');
    assert.equal(await admin.exam.count({ where: { id: examId, examTypeId: usedExamType.id } }), 1, 'Blocked deletion must preserve the exam');
    assert.equal(await admin.examQuestion.count({ where: { id: questionId, questionTypeId: usedQuestionType.id } }), 1, 'Blocked deletion must preserve the question');
  } finally {
    await admin.examQuestion.deleteMany({ where: { institutionId: institutionA.id } });
    await admin.exam.deleteMany({ where: { institutionId: institutionA.id } });
    await admin.questionType.deleteMany({ where: { institutionId: institutionA.id } });
    await admin.examType.deleteMany({ where: { institutionId: institutionA.id } });
    await admin.subject.deleteMany({ where: { institutionId: institutionA.id } });
    await admin.academicPeriod.deleteMany({ where: { institutionId: institutionA.id } });
    await admin.academicYear.deleteMany({ where: { institutionId: institutionA.id } });
    await admin.institution.deleteMany({ where: { id: { in: [institutionA.id, institutionB.id] } } });
    await admin.$disconnect();
  }
  console.log('Exam and question type lookup management tests passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
