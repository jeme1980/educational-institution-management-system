import { Prisma } from '@prisma/client';
import { getRequestTransaction } from '../db/prisma';
import { HttpError } from '../middleware/errorHandler.middleware';
import { withRlsContext } from '../middleware/rls-request.middleware';
import { recordAuditEvent } from './audit.service';
import { sha256SurveyExcelFile } from './surveys-excel.preflight';
import type {
  SurveyExcelImportErrorCode,
  SurveyExcelImportInput,
  SurveyExcelImportResult,
  SurveyExcelSemanticPreview,
} from './surveys-excel.types';

export const SURVEY_IMPORT_BATCH_STATUSES = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
} as const;

export class SurveyExcelImportError extends HttpError {
  constructor(statusCode: number, code: SurveyExcelImportErrorCode, message: string) {
    super(statusCode, message, code);
    this.name = 'SurveyExcelImportError';
  }
}

function importError(statusCode: number, code: SurveyExcelImportErrorCode, message: string): SurveyExcelImportError {
  return new SurveyExcelImportError(statusCode, code, message);
}

function previewIsValid(preview: SurveyExcelSemanticPreview): boolean {
  const summary = preview.summary;
  return Boolean(preview.survey && preview.round)
    && preview.errors.length === 0
    && summary.errorCount === 0
    && summary.indicatorRowsTotal === summary.indicatorRowsValid
    && summary.indicatorRowsValid === preview.indicatorResults.length
    && summary.domainRowsTotal === summary.domainRowsValid
    && summary.domainRowsValid === preview.domainResults.length
    && summary.comparisonRowsTotal === summary.comparisonRowsValid
    && summary.comparisonRowsValid === preview.comparisons.length
    && summary.participationRowsTotal === summary.participationRowsValid
    && summary.participationRowsValid === preview.participation.length;
}

function rowsMatchContext(input: SurveyExcelImportInput, academicYearId: string): boolean {
  const expected = {
    institutionId: input.institutionId,
    academicYearId,
    surveyId: input.surveyId,
    roundId: input.roundId,
  };
  const rows = [
    ...input.preview.indicatorResults,
    ...input.preview.domainResults,
    ...input.preview.comparisons,
    ...input.preview.participation,
  ];
  return rows.every((row) => (
    row.institutionId === expected.institutionId
    && row.academicYearId === expected.academicYearId
    && row.surveyId === expected.surveyId
    && row.roundId === expected.roundId
  ));
}

function uniqueTarget(error: Prisma.PrismaClientKnownRequestError): string {
  const target = error.meta?.['target'];
  return Array.isArray(target) ? target.join(',') : String(target || '');
}

/** Map only the unique constraints owned by the insert-only import contract. */
export function mapSurveyImportConstraintError(error: unknown): SurveyExcelImportError | undefined {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const modelName = String(error.meta?.['modelName'] || '');
    const target = uniqueTarget(error);
    if (modelName === 'SurveyImportBatch' && /fileHash|survey_import_batches.*fileHash/i.test(target)) {
      return importError(409, 'SURVEY_IMPORT_DUPLICATE_FILE', 'This file was already imported for the selected survey round.');
    }
    const resultTargets: Record<string, RegExp> = {
      SurveyIndicatorResult: /roundId.*indicatorId.*segmentId|survey_indicator_results.*roundId/i,
      SurveyDomainResult: /roundId.*domainId.*segmentId|survey_domain_results.*roundId/i,
      SurveyDomainComparison: /roundId.*domainId.*segmentId.*comparisonType|survey_domain_comparisons.*roundId/i,
      SurveyParticipationResult: /roundId.*segmentId|survey_participation_results.*roundId/i,
    };
    if (resultTargets[modelName]?.test(target)) {
      return importError(409, 'SURVEY_ROUND_RESULTS_ALREADY_EXIST', 'Survey results already exist for this round.');
    }
  }

  const databaseError = error as { code?: string; constraint?: string; message?: string };
  if (databaseError?.code === '23505') {
    const constraint = `${databaseError.constraint || ''} ${databaseError.message || ''}`;
    if (/survey_import_batches.*fileHash/i.test(constraint)) {
      return importError(409, 'SURVEY_IMPORT_DUPLICATE_FILE', 'This file was already imported for the selected survey round.');
    }
    if (/survey_(indicator_results|domain_results|domain_comparisons|participation_results).*roundId/i.test(constraint)) {
      return importError(409, 'SURVEY_ROUND_RESULTS_ALREADY_EXIST', 'Survey results already exist for this round.');
    }
  }
  return undefined;
}

/** Atomically insert one validated aggregate workbook for one survey round under tenant RLS. */
export async function executeSurveyExcelImport(input: SurveyExcelImportInput): Promise<SurveyExcelImportResult> {
  if (!previewIsValid(input.preview)) {
    throw importError(400, 'SURVEY_IMPORT_PREVIEW_INVALID', 'A valid semantic preview is required before import.');
  }

  const fileHash = sha256SurveyExcelFile(input.fileBuffer);
  const rowCount = input.preview.indicatorResults.length
    + input.preview.domainResults.length
    + input.preview.comparisons.length
    + input.preview.participation.length;

  try {
    return await withRlsContext(input.institutionId, async () => {
      const db = getRequestTransaction();
      if (!db) throw new Error('Survey import requires a transaction-bound RLS context.');
      await db.$executeRawUnsafe('SAVEPOINT survey_excel_import');
      try {
        await db.$executeRawUnsafe(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          `survey-import:${input.institutionId}:${input.surveyId}:${input.roundId}`,
        );

      const survey = await db.survey.findFirst({
        where: { id: input.surveyId, institutionId: input.institutionId },
        select: { id: true, institutionId: true, academicYearId: true, archivedAt: true },
      });
      if (!survey) throw importError(404, 'SURVEY_NOT_FOUND', 'Survey was not found.');
      if (survey.archivedAt) throw importError(409, 'SURVEY_ARCHIVED', 'Archived surveys cannot receive imported results.');

      const round = await db.surveyRound.findFirst({
        where: {
          id: input.roundId,
          institutionId: input.institutionId,
          surveyId: survey.id,
          academicYearId: survey.academicYearId,
        },
        select: { id: true },
      });
      if (!round) throw importError(404, 'SURVEY_ROUND_NOT_FOUND', 'Survey round was not found.');

      if (
        input.preview.survey?.id !== survey.id
        || input.preview.survey.institutionId !== input.institutionId
        || input.preview.survey.academicYearId !== survey.academicYearId
        || input.preview.round?.id !== round.id
        || input.preview.round.institutionId !== input.institutionId
        || input.preview.round.surveyId !== survey.id
        || input.preview.round.academicYearId !== survey.academicYearId
        || !rowsMatchContext(input, survey.academicYearId)
      ) {
        throw importError(400, 'SURVEY_IMPORT_PREVIEW_INVALID', 'The semantic preview does not match the selected survey round.');
      }

      const duplicate = await db.surveyImportBatch.findFirst({
        where: { institutionId: input.institutionId, surveyId: survey.id, roundId: round.id, fileHash },
        select: { id: true },
      });
      if (duplicate) throw importError(409, 'SURVEY_IMPORT_DUPLICATE_FILE', 'This file was already imported for the selected survey round.');

      const resultWhere = { institutionId: input.institutionId, surveyId: survey.id, roundId: round.id };
      const existingResults = await Promise.all([
        db.surveyIndicatorResult.findFirst({ where: resultWhere, select: { id: true } }),
        db.surveyDomainResult.findFirst({ where: resultWhere, select: { id: true } }),
        db.surveyDomainComparison.findFirst({ where: resultWhere, select: { id: true } }),
        db.surveyParticipationResult.findFirst({ where: resultWhere, select: { id: true } }),
      ]);
      if (existingResults.some(Boolean)) {
        throw importError(409, 'SURVEY_ROUND_RESULTS_ALREADY_EXIST', 'Survey results already exist for this round.');
      }
      if (rowCount === 0) throw importError(400, 'SURVEY_IMPORT_EMPTY', 'The validated workbook contains no result rows.');

      const batch = await db.surveyImportBatch.create({
        data: {
          institutionId: input.institutionId,
          academicYearId: survey.academicYearId,
          surveyId: survey.id,
          roundId: round.id,
          originalFileName: input.originalFileName,
          fileHash,
          importedByUserId: input.userId,
          status: SURVEY_IMPORT_BATCH_STATUSES.PENDING,
          rowCount,
          validRowCount: rowCount,
          invalidRowCount: 0,
        },
        select: { id: true },
      });

      if (input.preview.indicatorResults.length) {
        await db.surveyIndicatorResult.createMany({
          data: input.preview.indicatorResults.map((row) => ({
            institutionId: input.institutionId,
            academicYearId: survey.academicYearId,
            surveyId: survey.id,
            roundId: round.id,
            sectionId: row.sectionId,
            domainId: row.domainId,
            indicatorId: row.indicatorId,
            segmentId: row.segmentId,
            importBatchId: batch.id,
            reportedPercentage: row.reportedPercentage,
            respondentCount: row.respondentCount,
            earnedTotal: row.earnedTotal,
            possibleTotal: row.possibleTotal,
          })),
        });
      }
      if (input.preview.domainResults.length) {
        await db.surveyDomainResult.createMany({
          data: input.preview.domainResults.map((row) => ({
            institutionId: input.institutionId,
            academicYearId: survey.academicYearId,
            surveyId: survey.id,
            roundId: round.id,
            domainId: row.domainId,
            segmentId: row.segmentId,
            importBatchId: batch.id,
            scorePercentage: row.scorePercentage,
            respondentCount: row.respondentCount,
            isComparable: row.isComparable ?? true,
          })),
        });
      }
      if (input.preview.comparisons.length) {
        await db.surveyDomainComparison.createMany({
          data: input.preview.comparisons.map((row) => ({
            institutionId: input.institutionId,
            academicYearId: survey.academicYearId,
            surveyId: survey.id,
            roundId: round.id,
            domainId: row.domainId,
            segmentId: row.segmentId,
            comparisonType: row.comparisonType,
            comparisonCode: row.comparisonCode,
            comparisonValue: row.comparisonValue,
            comparisonRoundId: row.comparisonRoundId,
            noteAr: row.noteAr,
            noteHe: row.noteHe,
          })),
        });
      }
      if (input.preview.participation.length) {
        await db.surveyParticipationResult.createMany({
          data: input.preview.participation.map((row) => ({
            institutionId: input.institutionId,
            academicYearId: survey.academicYearId,
            surveyId: survey.id,
            roundId: round.id,
            segmentId: row.segmentId,
            importBatchId: batch.id,
            participantCount: row.participantCount,
            eligibleCount: row.eligibleCount,
            responseRate: row.responseRate,
          })),
        });
      }

      const importedAt = new Date();
      await db.surveyImportBatch.update({
        where: { id: batch.id },
        data: { status: SURVEY_IMPORT_BATCH_STATUSES.COMPLETED, importedAt },
      });
      await recordAuditEvent(db, {
        institutionId: input.institutionId,
        actorUserId: input.userId,
        action: 'SURVEY_RESULTS_IMPORTED',
        entityType: 'SurveyImportBatch',
        entityId: batch.id,
        metadata: { surveyId: survey.id, roundId: round.id, rowCount },
      });

        const result: SurveyExcelImportResult = {
          importBatchId: batch.id,
          institutionId: input.institutionId,
          academicYearId: survey.academicYearId,
          surveyId: survey.id,
          roundId: round.id,
          status: SURVEY_IMPORT_BATCH_STATUSES.COMPLETED,
          fileHash,
          rowCount,
          validRowCount: rowCount,
          invalidRowCount: 0,
          importedAt,
        };
        await db.$executeRawUnsafe('RELEASE SAVEPOINT survey_excel_import');
        return result;
      } catch (error) {
        await db.$executeRawUnsafe('ROLLBACK TO SAVEPOINT survey_excel_import');
        await db.$executeRawUnsafe('RELEASE SAVEPOINT survey_excel_import');
        throw error;
      }
    });
  } catch (error) {
    if (error instanceof SurveyExcelImportError) throw error;
    throw mapSurveyImportConstraintError(error) || error;
  }
}
