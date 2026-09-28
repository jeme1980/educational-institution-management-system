import { prisma } from '../db/prisma';
import { withRlsContext } from '../middleware/rls-request.middleware';
import {
  SURVEY_EXCEL_COMPARISON_TYPES,
  type SurveyExcelSemanticError,
  type SurveyExcelSemanticPreview,
  type SurveyExcelSemanticPreviewInput,
  type SurveyExcelSemanticPreviewSummary,
  type SurveyExcelSource,
} from './surveys-excel.types';

type ResolvedContext = {
  institutionId: string;
  academicYearId: string;
  surveyId: string;
  roundId: string;
};

const contextError = (code: SurveyExcelSemanticError['code'], message: string): SurveyExcelSemanticError => ({
  sheet: '',
  row: 0,
  column: '',
  code,
  message,
  scope: 'CONTEXT',
});

const rowError = (source: SurveyExcelSource, column: string, code: SurveyExcelSemanticError['code'], message: string): SurveyExcelSemanticError => ({
  sheet: source.sourceSheet,
  row: source.sourceRow,
  column,
  code,
  message,
  scope: 'ROW',
});

function summary(input: SurveyExcelSemanticPreviewInput, preview: Omit<SurveyExcelSemanticPreview, 'summary'>): SurveyExcelSemanticPreviewSummary {
  return {
    indicatorRowsTotal: input.workbook.indicatorResults.length,
    indicatorRowsValid: preview.indicatorResults.length,
    domainRowsTotal: input.workbook.domainResults.length,
    domainRowsValid: preview.domainResults.length,
    comparisonRowsTotal: input.workbook.comparisons.length,
    comparisonRowsValid: preview.comparisons.length,
    participationRowsTotal: input.workbook.participation.length,
    participationRowsValid: preview.participation.length,
    errorCount: preview.errors.length,
  };
}

function finish(input: SurveyExcelSemanticPreviewInput, preview: Omit<SurveyExcelSemanticPreview, 'summary'>): SurveyExcelSemanticPreview {
  return { ...preview, summary: summary(input, preview) };
}

const emptyPreview = (errors: SurveyExcelSemanticError[], survey: SurveyExcelSemanticPreview['survey'] = null): Omit<SurveyExcelSemanticPreview, 'summary'> => ({
  survey,
  round: null,
  indicatorResults: [],
  domainResults: [],
  comparisons: [],
  participation: [],
  errors,
});

const unique = (values: Array<string | null>): string[] => [...new Set(values.filter((value): value is string => Boolean(value)))];

/** Resolve an already syntactically validated survey workbook using the runtime school role and tenant RLS. */
export async function previewSurveyExcelSemantics(input: SurveyExcelSemanticPreviewInput): Promise<SurveyExcelSemanticPreview> {
  return withRlsContext(input.institutionId, async () => {
    const survey = await prisma.survey.findFirst({
      where: { id: input.surveyId, institutionId: input.institutionId },
      select: { id: true, institutionId: true, academicYearId: true, status: true, archivedAt: true },
    });
    if (!survey) return finish(input, emptyPreview([contextError('SURVEY_NOT_FOUND', 'Survey was not found.')]));
    if (survey.archivedAt) return finish(input, emptyPreview([contextError('SURVEY_ARCHIVED', 'Archived surveys cannot receive imported results.')], survey));

    const round = await prisma.surveyRound.findFirst({
      where: {
        id: input.roundId,
        institutionId: input.institutionId,
        surveyId: survey.id,
        academicYearId: survey.academicYearId,
      },
      select: { id: true, institutionId: true, academicYearId: true, surveyId: true, code: true, status: true },
    });
    if (!round) return finish(input, emptyPreview([contextError('SURVEY_ROUND_NOT_FOUND', 'Survey round was not found.')], survey));

    const indicatorCodes = unique(input.workbook.indicatorResults.map((row) => row.indicatorCode));
    const domainCodes = unique([
      ...input.workbook.domainResults.map((row) => row.domainCode),
      ...input.workbook.comparisons.map((row) => row.domainCode),
    ]);
    const segmentCodes = unique([
      ...input.workbook.indicatorResults.map((row) => row.segmentCode),
      ...input.workbook.domainResults.map((row) => row.segmentCode),
      ...input.workbook.comparisons.map((row) => row.segmentCode),
      ...input.workbook.participation.map((row) => row.segmentCode),
    ]);
    const comparisonRoundCodes = unique(input.workbook.comparisons.map((row) => row.comparisonRoundCode));

    const [indicators, domains, segments, comparisonRounds] = await Promise.all([
      prisma.surveyIndicator.findMany({
        where: { institutionId: input.institutionId, surveyId: survey.id, code: { in: indicatorCodes } },
        select: { id: true, code: true, domainId: true, domain: { select: { sectionId: true } } },
      }),
      prisma.surveyDomain.findMany({
        where: { institutionId: input.institutionId, surveyId: survey.id, code: { in: domainCodes } },
        select: { id: true, code: true },
      }),
      prisma.surveySegment.findMany({
        where: { institutionId: input.institutionId, surveyId: survey.id, code: { in: segmentCodes } },
        select: { id: true, code: true },
      }),
      prisma.surveyRound.findMany({
        where: {
          institutionId: input.institutionId,
          surveyId: survey.id,
          academicYearId: survey.academicYearId,
          code: { in: comparisonRoundCodes },
        },
        select: { id: true, code: true },
      }),
    ]);

    const indicatorByCode = new Map(indicators.map((item) => [item.code, item]));
    const domainByCode = new Map(domains.map((item) => [item.code, item]));
    const segmentByCode = new Map(segments.map((item) => [item.code, item]));
    const roundByCode = new Map(comparisonRounds.map((item) => [item.code, item]));
    const errors: SurveyExcelSemanticError[] = [];
    const context: ResolvedContext = {
      institutionId: input.institutionId,
      academicYearId: survey.academicYearId,
      surveyId: survey.id,
      roundId: round.id,
    };

    const indicatorResults = input.workbook.indicatorResults.flatMap((row) => {
      const indicator = indicatorByCode.get(row.indicatorCode);
      const segment = segmentByCode.get(row.segmentCode);
      if (!indicator) errors.push(rowError(row, 'indicatorCode', 'UNKNOWN_INDICATOR_CODE', `Indicator code ${row.indicatorCode} was not found in this survey.`));
      if (!segment) errors.push(rowError(row, 'segmentCode', 'UNKNOWN_SEGMENT_CODE', `Segment code ${row.segmentCode} was not found in this survey.`));
      return indicator && segment ? [{ ...row, ...context, sectionId: indicator.domain.sectionId, domainId: indicator.domainId, indicatorId: indicator.id, segmentId: segment.id }] : [];
    });

    const domainResults = input.workbook.domainResults.flatMap((row) => {
      const domain = domainByCode.get(row.domainCode);
      const segment = segmentByCode.get(row.segmentCode);
      if (!domain) errors.push(rowError(row, 'domainCode', 'UNKNOWN_DOMAIN_CODE', `Domain code ${row.domainCode} was not found in this survey.`));
      if (!segment) errors.push(rowError(row, 'segmentCode', 'UNKNOWN_SEGMENT_CODE', `Segment code ${row.segmentCode} was not found in this survey.`));
      return domain && segment ? [{ ...row, ...context, domainId: domain.id, segmentId: segment.id }] : [];
    });

    const comparisons = input.workbook.comparisons.flatMap((row) => {
      const domain = domainByCode.get(row.domainCode);
      const segment = segmentByCode.get(row.segmentCode);
      const comparisonRound = row.comparisonRoundCode ? roundByCode.get(row.comparisonRoundCode) : null;
      const comparisonTypeValid = SURVEY_EXCEL_COMPARISON_TYPES.includes(row.comparisonType as typeof SURVEY_EXCEL_COMPARISON_TYPES[number]);
      if (!domain) errors.push(rowError(row, 'domainCode', 'UNKNOWN_DOMAIN_CODE', `Domain code ${row.domainCode} was not found in this survey.`));
      if (!segment) errors.push(rowError(row, 'segmentCode', 'UNKNOWN_SEGMENT_CODE', `Segment code ${row.segmentCode} was not found in this survey.`));
      if (!comparisonTypeValid) errors.push(rowError(row, 'comparisonType', 'INVALID_COMPARISON_TYPE', `Comparison type ${row.comparisonType} is not supported.`));
      if (row.comparisonRoundCode && !comparisonRound) errors.push(rowError(row, 'comparisonRoundCode', 'UNKNOWN_COMPARISON_ROUND_CODE', `Comparison round code ${row.comparisonRoundCode} was not found in this survey.`));
      return domain && segment && comparisonTypeValid && (!row.comparisonRoundCode || comparisonRound)
        ? [{ ...row, ...context, domainId: domain.id, segmentId: segment.id, comparisonRoundId: comparisonRound?.id ?? null }]
        : [];
    });

    const participation = input.workbook.participation.flatMap((row) => {
      const segment = segmentByCode.get(row.segmentCode);
      if (!segment) errors.push(rowError(row, 'segmentCode', 'UNKNOWN_SEGMENT_CODE', `Segment code ${row.segmentCode} was not found in this survey.`));
      return segment ? [{ ...row, ...context, segmentId: segment.id }] : [];
    });

    return finish(input, { survey, round, indicatorResults, domainResults, comparisons, participation, errors });
  });
}
