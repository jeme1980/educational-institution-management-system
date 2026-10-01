import { getRequestTransaction, prisma } from '../db/prisma';
import { HttpError } from '../middleware/errorHandler.middleware';
import { withRlsContext } from '../middleware/rls-request.middleware';

interface NamedItem { id: string; code: string; nameAr: string; nameHe: string | null }
interface DomainItem extends NamedItem { section: NamedItem }
interface ComparisonGroup {
  roundId: string;
  domainId: string;
  segmentId: string;
  section: NamedItem;
  domain: DomainItem;
  segment: NamedItem;
  domainResult: { id: string; scorePercentage: number | null; respondentCount: number | null; isComparable: boolean } | null;
  comparisons: { id: string; comparisonType: string; comparisonCode: string | null; comparisonValue: number | null; comparisonRoundCode: string | null; noteAr: string | null; noteHe: string | null }[];
}

export interface SurveyComparisonsResponse {
  survey: { id: string; nameAr: string; nameHe: string | null; academicYearId: string; archivedAt: Date | null };
  rounds: { id: string; code: string; nameAr: string; nameHe: string | null; sequenceNumber: number; measurementDate: Date | null; status: string }[];
  groups: ComparisonGroup[];
}

interface GroupSource {
  roundId: string;
  domainId: string;
  segmentId: string;
  domain: NamedItem & { sortOrder: number; section: NamedItem & { sortOrder: number } };
  segment: NamedItem & { sortOrder: number };
}

const named = (item: NamedItem): NamedItem => ({ id: item.id, code: item.code, nameAr: item.nameAr, nameHe: item.nameHe });
const numberOrNull = (value: { toString(): string } | null): number | null => value === null ? null : Number(value.toString());
const compareText = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

/** Read reported comparisons alongside stored domain results, without deriving gaps or trends. */
export async function readSurveyComparisons(institutionId: string, surveyId: string): Promise<SurveyComparisonsResponse> {
  const read = async (): Promise<SurveyComparisonsResponse> => {
    const survey = await prisma.survey.findFirst({
      where: { id: surveyId, institutionId },
      select: { id: true, nameAr: true, nameHe: true, academicYearId: true, archivedAt: true },
    });
    if (!survey) throw new HttpError(404, 'Survey was not found.', 'SURVEY_NOT_FOUND');

    const where = { institutionId, academicYearId: survey.academicYearId, surveyId: survey.id };
    const [rounds, results, comparisons] = await Promise.all([
      prisma.surveyRound.findMany({ where, orderBy: [{ sequenceNumber: 'asc' }, { measurementDate: 'asc' }, { id: 'asc' }], select: { id: true, code: true, nameAr: true, nameHe: true, sequenceNumber: true, measurementDate: true, status: true } }),
      prisma.surveyDomainResult.findMany({ where, include: { domain: { include: { section: true } }, segment: true } }),
      prisma.surveyDomainComparison.findMany({ where, include: { domain: { include: { section: true } }, segment: true, comparisonRound: { select: { code: true } } } }),
    ]);

    const groups = new Map<string, { value: ComparisonGroup; source: GroupSource }>();
    const groupFor = (row: GroupSource): ComparisonGroup => {
      const key = `${row.roundId}:${row.domainId}:${row.segmentId}`;
      let group = groups.get(key);
      if (!group) {
        const section = named(row.domain.section);
        group = {
          source: row,
          value: {
            roundId: row.roundId, domainId: row.domainId, segmentId: row.segmentId,
            section, domain: { ...named(row.domain), section }, segment: named(row.segment),
            domainResult: null, comparisons: [],
          },
        };
        groups.set(key, group);
      }
      return group.value;
    };

    for (const row of results) {
      groupFor(row).domainResult = {
        id: row.id, scorePercentage: numberOrNull(row.scorePercentage),
        respondentCount: row.respondentCount, isComparable: row.isComparable,
      };
    }
    for (const row of comparisons) {
      groupFor(row).comparisons.push({
        id: row.id, comparisonType: row.comparisonType, comparisonCode: row.comparisonCode,
        comparisonValue: numberOrNull(row.comparisonValue),
        comparisonRoundCode: row.comparisonRound?.code ?? null,
        noteAr: row.noteAr, noteHe: row.noteHe,
      });
    }

    const roundOrder = new Map(rounds.map((round, index) => [round.id, index]));
    const ordered = [...groups.values()].sort((a, b) =>
      (roundOrder.get(a.value.roundId) ?? Number.MAX_SAFE_INTEGER) - (roundOrder.get(b.value.roundId) ?? Number.MAX_SAFE_INTEGER)
      || a.source.domain.section.sortOrder - b.source.domain.section.sortOrder
      || a.source.domain.sortOrder - b.source.domain.sortOrder
      || a.source.segment.sortOrder - b.source.segment.sortOrder
      || compareText(a.value.section.id, b.value.section.id)
      || compareText(a.value.domainId, b.value.domainId)
      || compareText(a.value.segmentId, b.value.segmentId)
    ).map(({ value }) => {
      value.comparisons.sort((a, b) => compareText(a.comparisonType, b.comparisonType) || compareText(a.id, b.id));
      return value;
    });
    return { survey, rounds, groups: ordered };
  };
  return getRequestTransaction() ? read() : withRlsContext(institutionId, read);
}
