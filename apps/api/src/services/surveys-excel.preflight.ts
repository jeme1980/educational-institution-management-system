import { createHash } from 'node:crypto';
import { prisma } from '../db/prisma';
import { withRlsContext } from '../middleware/rls-request.middleware';
import type {
  SurveyExcelImportPreflight,
  SurveyExcelImportPreflightInput,
  SurveyExcelPreflightError,
} from './surveys-excel.types';

export type SurveyRoundResultLookup = {
  institutionId: string;
  surveyId: string;
  roundId: string;
};

export function sha256SurveyExcelFile(buffer: Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex');
}

async function hasSurveyRoundResultsInCurrentContext(input: SurveyRoundResultLookup): Promise<boolean> {
  const where = { institutionId: input.institutionId, surveyId: input.surveyId, roundId: input.roundId };
  const results = await Promise.all([
    prisma.surveyIndicatorResult.findFirst({ where, select: { id: true } }),
    prisma.surveyDomainResult.findFirst({ where, select: { id: true } }),
    prisma.surveyDomainComparison.findFirst({ where, select: { id: true } }),
    prisma.surveyParticipationResult.findFirst({ where, select: { id: true } }),
  ]);
  return results.some(Boolean);
}

/** Check only the selected tenant/survey/round through the runtime school role and RLS. */
export async function hasSurveyRoundResults(input: SurveyRoundResultLookup): Promise<boolean> {
  return withRlsContext(input.institutionId, () => hasSurveyRoundResultsInCurrentContext(input));
}

const contextError = (code: SurveyExcelPreflightError['code'], message: string): SurveyExcelPreflightError => ({
  sheet: '',
  row: 0,
  column: '',
  code,
  message,
  scope: 'CONTEXT',
});

const invalid = (
  input: SurveyExcelImportPreflightInput,
  fileHash: string,
  errors: SurveyExcelPreflightError[],
  academicYearId: string | null = null,
): SurveyExcelImportPreflight => ({
  surveyId: input.surveyId,
  roundId: input.roundId,
  academicYearId,
  fileHash,
  hasExistingResults: false,
  duplicateImportFound: false,
  canImport: false,
  errors,
});

/** Read-only preparation for a later atomic insert-only import. */
export async function preflightSurveyExcelImport(input: SurveyExcelImportPreflightInput): Promise<SurveyExcelImportPreflight> {
  const fileHash = sha256SurveyExcelFile(input.fileBuffer);
  if (input.preview.errors.length) return invalid(input, fileHash, input.preview.errors);

  return withRlsContext(input.institutionId, async () => {
    const survey = await prisma.survey.findFirst({
      where: { id: input.surveyId, institutionId: input.institutionId },
      select: { id: true, institutionId: true, academicYearId: true, archivedAt: true },
    });
    if (!survey || input.preview.survey?.id !== survey.id || input.preview.survey.institutionId !== input.institutionId) {
      return invalid(input, fileHash, [contextError('SURVEY_NOT_FOUND', 'Survey was not found.')]);
    }
    if (survey.archivedAt) {
      return invalid(input, fileHash, [contextError('SURVEY_ARCHIVED', 'Archived surveys cannot receive imported results.')], survey.academicYearId);
    }

    const round = await prisma.surveyRound.findFirst({
      where: {
        id: input.roundId,
        institutionId: input.institutionId,
        surveyId: survey.id,
        academicYearId: survey.academicYearId,
      },
      select: { id: true },
    });
    if (!round || input.preview.round?.id !== round.id) {
      return invalid(input, fileHash, [contextError('SURVEY_ROUND_NOT_FOUND', 'Survey round was not found.')], survey.academicYearId);
    }

    const [hasExistingResults, duplicateImport] = await Promise.all([
      hasSurveyRoundResultsInCurrentContext({ institutionId: input.institutionId, surveyId: survey.id, roundId: round.id }),
      prisma.surveyImportBatch.findFirst({
        where: { institutionId: input.institutionId, surveyId: survey.id, roundId: round.id, fileHash },
        select: { id: true },
      }),
    ]);
    const errors: SurveyExcelPreflightError[] = hasExistingResults ? [{
      sheet: '',
      row: 0,
      column: '',
      code: 'SURVEY_ROUND_RESULTS_ALREADY_EXIST',
      message: 'Survey results already exist for this round.',
      scope: 'PREFLIGHT',
    }] : [];
    return {
      surveyId: survey.id,
      roundId: round.id,
      academicYearId: survey.academicYearId,
      fileHash,
      hasExistingResults,
      duplicateImportFound: Boolean(duplicateImport),
      canImport: !hasExistingResults,
      errors,
    };
  });
}
