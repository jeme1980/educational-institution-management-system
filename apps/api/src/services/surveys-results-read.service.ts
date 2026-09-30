import { getRequestTransaction, prisma } from '../db/prisma';
import { HttpError } from '../middleware/errorHandler.middleware';
import { withRlsContext } from '../middleware/rls-request.middleware';

interface NamedItem { id: string; code: string; nameAr: string; nameHe: string | null }
type SectionItem = NamedItem;
type DomainItem = NamedItem & { section: SectionItem };
type SegmentItem = NamedItem;
type NullableNumber = number | null;

export interface SurveyRoundResultsResponse {
  survey: { id: string; nameAr: string; nameHe: string | null; academicYearId: string; archivedAt: Date | null };
  round: { id: string; code: string; nameAr: string; nameHe: string | null; sequenceNumber: number; status: string; measurementDate: Date | null };
  import: { id: string; originalFileName: string; status: string; rowCount: number | null; importedAt: Date | null } | null;
  indicatorResults: { id: string; section: SectionItem; domain: DomainItem; indicator: { id: string; code: string; textAr: string; textHe: string | null }; segment: SegmentItem; reportedPercentage: NullableNumber; respondentCount: NullableNumber; earnedTotal: NullableNumber; possibleTotal: NullableNumber }[];
  domainResults: { id: string; domain: DomainItem; segment: SegmentItem; scorePercentage: NullableNumber; respondentCount: NullableNumber; isComparable: boolean }[];
  comparisons: { id: string; domain: DomainItem; segment: SegmentItem; comparisonType: string; comparisonCode: string | null; comparisonValue: NullableNumber; comparisonRoundCode: string | null; noteAr: string | null; noteHe: string | null }[];
  participation: { id: string; segment: SegmentItem; participantCount: NullableNumber; eligibleCount: NullableNumber; responseRate: NullableNumber }[];
}

const numberOrNull = (value: { toString(): string } | null): number | null => value === null ? null : Number(value.toString());
const byNumber = (a: number, b: number) => a - b;
const byText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const orderedDomain = (a: { section: { sortOrder: number }; sortOrder: number }, b: { section: { sortOrder: number }; sortOrder: number }) =>
  byNumber(a.section.sortOrder, b.section.sortOrder) || byNumber(a.sortOrder, b.sortOrder);
const domainDto = (domain: { id: string; code: string; nameAr: string; nameHe: string | null; section: SectionItem }): DomainItem => ({
  id: domain.id, code: domain.code, nameAr: domain.nameAr, nameHe: domain.nameHe,
  section: { id: domain.section.id, code: domain.section.code, nameAr: domain.section.nameAr, nameHe: domain.section.nameHe },
});
const segmentDto = (segment: SegmentItem): SegmentItem => ({ id: segment.id, code: segment.code, nameAr: segment.nameAr, nameHe: segment.nameHe });

/** Return stored aggregate values for one tenant-owned round, without recalculation. */
export async function readSurveyRoundResults(institutionId: string, surveyId: string, roundId: string): Promise<SurveyRoundResultsResponse> {
  const read = async (): Promise<SurveyRoundResultsResponse> => {
    const survey = await prisma.survey.findFirst({
      where: { id: surveyId, institutionId },
      select: { id: true, nameAr: true, nameHe: true, academicYearId: true, archivedAt: true },
    });
    if (!survey) throw new HttpError(404, 'Survey was not found.', 'SURVEY_NOT_FOUND');
    const round = await prisma.surveyRound.findFirst({
      where: { id: roundId, institutionId, surveyId: survey.id, academicYearId: survey.academicYearId },
      select: { id: true, code: true, nameAr: true, nameHe: true, sequenceNumber: true, status: true, measurementDate: true },
    });
    if (!round) throw new HttpError(404, 'Survey round was not found.', 'SURVEY_ROUND_NOT_FOUND');

    const where = { institutionId, academicYearId: survey.academicYearId, surveyId: survey.id, roundId: round.id };
    const [batch, indicators, domains, comparisons, participation] = await Promise.all([
      prisma.surveyImportBatch.findFirst({ where, orderBy: [{ importedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }], select: { id: true, originalFileName: true, status: true, rowCount: true, importedAt: true } }),
      prisma.surveyIndicatorResult.findMany({ where, include: { section: true, domain: { include: { section: true } }, indicator: true, segment: true } }),
      prisma.surveyDomainResult.findMany({ where, include: { domain: { include: { section: true } }, segment: true } }),
      prisma.surveyDomainComparison.findMany({ where, include: { domain: { include: { section: true } }, segment: true, comparisonRound: true } }),
      prisma.surveyParticipationResult.findMany({ where, include: { segment: true } }),
    ]);

    indicators.sort((a, b) => orderedDomain(a.domain, b.domain) || byNumber(a.indicator.sortOrder, b.indicator.sortOrder) || byNumber(a.segment.sortOrder, b.segment.sortOrder) || byText(a.id, b.id));
    domains.sort((a, b) => orderedDomain(a.domain, b.domain) || byNumber(a.segment.sortOrder, b.segment.sortOrder) || byText(a.id, b.id));
    comparisons.sort((a, b) => orderedDomain(a.domain, b.domain) || byNumber(a.segment.sortOrder, b.segment.sortOrder) || byText(a.comparisonType, b.comparisonType) || byText(a.id, b.id));
    participation.sort((a, b) => byNumber(a.segment.sortOrder, b.segment.sortOrder) || byText(a.id, b.id));

    return {
      survey, round, import: batch,
      indicatorResults: indicators.map((row) => ({ id: row.id, section: { id: row.section.id, code: row.section.code, nameAr: row.section.nameAr, nameHe: row.section.nameHe }, domain: domainDto(row.domain), indicator: { id: row.indicator.id, code: row.indicator.code, textAr: row.indicator.textAr, textHe: row.indicator.textHe }, segment: segmentDto(row.segment), reportedPercentage: numberOrNull(row.reportedPercentage), respondentCount: row.respondentCount, earnedTotal: numberOrNull(row.earnedTotal), possibleTotal: numberOrNull(row.possibleTotal) })),
      domainResults: domains.map((row) => ({ id: row.id, domain: domainDto(row.domain), segment: segmentDto(row.segment), scorePercentage: numberOrNull(row.scorePercentage), respondentCount: row.respondentCount, isComparable: row.isComparable })),
      comparisons: comparisons.map((row) => ({ id: row.id, domain: domainDto(row.domain), segment: segmentDto(row.segment), comparisonType: row.comparisonType, comparisonCode: row.comparisonCode, comparisonValue: numberOrNull(row.comparisonValue), comparisonRoundCode: row.comparisonRound?.code ?? null, noteAr: row.noteAr, noteHe: row.noteHe })),
      participation: participation.map((row) => ({ id: row.id, segment: segmentDto(row.segment), participantCount: row.participantCount, eligibleCount: row.eligibleCount, responseRate: numberOrNull(row.responseRate) })),
    };
  };
  return getRequestTransaction() ? read() : withRlsContext(institutionId, read);
}
