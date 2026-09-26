import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { HttpError } from '../middleware/errorHandler.middleware';

export const canonicalSurveyCode = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '_');
export const surveyStatuses = new Set(['DRAFT', 'ACTIVE', 'CLOSED']);
export const roundStatuses = new Set(['PLANNED', 'OPEN', 'CLOSED']);

export function surveyDto(survey: any, counts?: Record<string, number>) {
  return { id: survey.id, academicYearId: survey.academicYearId, nameAr: survey.nameAr, nameHe: survey.nameHe, descriptionAr: survey.descriptionAr, descriptionHe: survey.descriptionHe, audienceType: survey.audienceType, status: survey.status, isActive: survey.isActive, archivedAt: survey.archivedAt, createdAt: survey.createdAt, updatedAt: survey.updatedAt, ...(counts || {}) };
}

export async function requireAcademicYear(institutionId: string, academicYearId: string) {
  const year = await prisma.academicYear.findFirst({ where: { id: academicYearId, institutionId, archivedAt: null } });
  if (!year) throw new HttpError(404, 'Academic year was not found.', 'ACADEMIC_YEAR_NOT_FOUND');
  return year;
}
export async function requireSurvey(institutionId: string, surveyId: string, allowArchived = false) {
  const survey = await prisma.survey.findFirst({ where: { id: surveyId, institutionId, ...(allowArchived ? {} : { archivedAt: null }) } });
  if (!survey) throw new HttpError(404, 'Survey was not found.', 'SURVEY_NOT_FOUND');
  return survey;
}
export async function requireEditableSurvey(institutionId: string, surveyId: string) {
  const survey = await requireSurvey(institutionId, surveyId, true);
  if (survey.archivedAt) throw new HttpError(409, 'Archived surveys cannot be changed.', 'SURVEY_ARCHIVED');
  return survey;
}
export async function hasSurveyResults(surveyId: string) {
  const [indicator, domain, comparison, participation, imported] = await Promise.all([
    prisma.surveyIndicatorResult.count({ where: { surveyId } }), prisma.surveyDomainResult.count({ where: { surveyId } }),
    prisma.surveyDomainComparison.count({ where: { surveyId } }), prisma.surveyParticipationResult.count({ where: { surveyId } }),
    prisma.surveyImportBatch.count({ where: { surveyId, status: { in: ['COMPLETED', 'SUCCESS'] } } }),
  ]);
  return indicator + domain + comparison + participation + imported > 0;
}
export async function assertStructureUnlocked(surveyId: string, changesIdentity: boolean) {
  if (changesIdentity && await hasSurveyResults(surveyId)) throw new HttpError(409, 'Historical survey structure is locked.', 'SURVEY_STRUCTURE_LOCKED');
}
export function assertRoundDates(input: { startsAt?: Date | null; endsAt?: Date | null; measurementDate?: Date | null }, year: { startDate: Date; endDate: Date }) {
  if (input.startsAt && input.endsAt && input.startsAt > input.endsAt) throw new HttpError(400, 'Round start date must not be after its end date.', 'INVALID_SURVEY_ROUND_DATES');
  if (input.measurementDate && (input.measurementDate < year.startDate || input.measurementDate > year.endDate)) throw new HttpError(400, 'Measurement date must be within the academic year.', 'INVALID_SURVEY_ROUND_DATES');
}
export function duplicateError(error: unknown, code: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return new HttpError(409, 'A survey code must be unique within its survey.', code);
  return error;
}
