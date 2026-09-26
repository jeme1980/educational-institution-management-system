import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { testAdminPrisma as admin } from '../db/test-admin-prisma';
import { withRlsContext } from '../middleware/rls-request.middleware';
import * as controller from '../controllers/surveys.controller';

const response = () => { let body: any; const res: any = { status: () => res, json: (value: unknown) => { body = value; return res; } }; return { res, get body() { return body; } }; };
const req = (institutionId: string, surveyId: string, indicatorId: string, body: unknown) => ({ context: { institutionId }, institutionId, params: { surveyId, indicatorId }, body, user: { uid: '00000000-0000-4000-8000-000000000001' } } as any);

test('real survey results lock indicator identity while permitting presentation updates', async () => {
  const [type, region, state, language] = await Promise.all([admin.educationType.findFirst(), admin.region.findFirst(), admin.institutionStatus.findFirst(), admin.language.findFirst()]); assert.ok(type && region && state && language);
  const marker = `survey-lock-${randomUUID().slice(0, 8)}`; let institutionId = ''; let yearId = ''; let surveyId = ''; let sectionId = ''; let domainId = ''; let indicatorId = ''; let roundId = ''; let segmentId = ''; let resultId = '';
  try {
    const institution = await admin.institution.create({ data: { schoolCode: `${Date.now()}`.slice(-10), slug: marker, nameAr: 'Lock', typeId: type.id, regionId: region.id, statusId: state.id, defaultLanguageId: language.id } }); institutionId = institution.id;
    const year = await admin.academicYear.create({ data: { institutionId, yearLabel: marker, startDate: new Date('2099-09-01'), endDate: new Date('2100-06-30') } }); yearId = year.id;
    const survey = await admin.survey.create({ data: { institutionId, academicYearId: yearId, nameAr: 'Lock' } }); surveyId = survey.id;
    const section = await admin.surveySection.create({ data: { institutionId, surveyId, code: 'SECTION', nameAr: 'Section' } }); sectionId = section.id;
    const domain = await admin.surveyDomain.create({ data: { institutionId, surveyId, sectionId, code: 'DOMAIN', nameAr: 'Domain' } }); domainId = domain.id;
    const indicator = await admin.surveyIndicator.create({ data: { institutionId, surveyId, domainId, code: 'INDICATOR', textAr: 'Meaning' } }); indicatorId = indicator.id;
    const round = await admin.surveyRound.create({ data: { institutionId, academicYearId: yearId, surveyId, code: 'ROUND', nameAr: 'Round', sequenceNumber: 1 } }); roundId = round.id;
    const segment = await admin.surveySegment.create({ data: { institutionId, surveyId, code: 'SEGMENT', nameAr: 'Segment' } }); segmentId = segment.id;
    resultId = (await admin.surveyIndicatorResult.create({ data: { institutionId, academicYearId: yearId, surveyId, roundId, sectionId, domainId, indicatorId, segmentId, reportedPercentage: 50 } })).id;
    await assert.rejects(() => withRlsContext(institutionId, () => controller.updateIndicator(req(institutionId, surveyId, indicatorId, { code: 'CHANGED' }), response().res)), (error: any) => error?.code === 'SURVEY_STRUCTURE_LOCKED');
    const updated = response(); await withRlsContext(institutionId, () => controller.updateIndicator(req(institutionId, surveyId, indicatorId, { sortOrder: 7, descriptionAr: 'Presentation' }), updated.res)); assert.equal(updated.body.sortOrder, 7); assert.equal(updated.body.descriptionAr, 'Presentation');
  } finally {
    if (resultId) await admin.surveyIndicatorResult.delete({ where: { id: resultId } }).catch(() => undefined); if (segmentId) await admin.surveySegment.delete({ where: { id: segmentId } }).catch(() => undefined); if (roundId) await admin.surveyRound.delete({ where: { id: roundId } }).catch(() => undefined); if (indicatorId) await admin.surveyIndicator.delete({ where: { id: indicatorId } }).catch(() => undefined); if (domainId) await admin.surveyDomain.delete({ where: { id: domainId } }).catch(() => undefined); if (sectionId) await admin.surveySection.delete({ where: { id: sectionId } }).catch(() => undefined); if (surveyId) await admin.survey.delete({ where: { id: surveyId } }).catch(() => undefined); if (yearId) await admin.academicYear.delete({ where: { id: yearId } }).catch(() => undefined); if (institutionId) await admin.institution.delete({ where: { id: institutionId } }).catch(() => undefined); await admin.$disconnect();
  }
});
