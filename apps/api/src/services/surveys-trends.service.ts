import { Prisma } from '@prisma/client';
import { getRequestTransaction, prisma } from '../db/prisma';
import { HttpError } from '../middleware/errorHandler.middleware';
import { withRlsContext } from '../middleware/rls-request.middleware';

interface NamedItem { id: string; code: string; nameAr: string; nameHe: string | null }
interface DomainItem extends NamedItem { section: NamedItem }
interface IndicatorItem { id: string; code: string; textAr: string; textHe: string | null; isReverseDirection: boolean }
interface Summary { firstValue: number | null; latestValue: number | null; changeFromFirst: number | null }
interface ValuePoint { roundId: string; value: number | null; respondentCount: number | null; deltaFromPrevious: number | null }
interface DomainPoint extends ValuePoint { isComparable: boolean | null }
interface ParticipationPoint { roundId: string; participantCount: number | null; eligibleCount: number | null; responseRate: number | null; deltaFromPrevious: number | null }
interface IndicatorTrend extends Summary { indicator: IndicatorItem; domain: DomainItem; section: NamedItem; segment: NamedItem; points: ValuePoint[] }
interface DomainTrend extends Summary { domain: DomainItem; section: NamedItem; segment: NamedItem; points: DomainPoint[] }
interface ParticipationTrend extends Summary { segment: NamedItem; points: ParticipationPoint[] }

export interface SurveyTrendsResponse {
  survey: { id: string; nameAr: string; nameHe: string | null; academicYearId: string; archivedAt: Date | null };
  rounds: { id: string; code: string; nameAr: string; nameHe: string | null; sequenceNumber: number; measurementDate: Date | null; status: string }[];
  indicatorTrends: IndicatorTrend[];
  domainTrends: DomainTrend[];
  participationTrends: ParticipationTrend[];
}

const named = (item: NamedItem): NamedItem => ({ id: item.id, code: item.code, nameAr: item.nameAr, nameHe: item.nameHe });
const domainItem = (item: DomainItem): DomainItem => ({ ...named(item), section: named(item.section) });
const numberOrNull = (value: { toString(): string } | null): number | null => value === null ? null : Number(value.toString());
const byNumber = (a: number, b: number) => a - b;
const byId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

// Missing and stored-null points never become zero. A later value compares with the last non-null measurement.
function summarize<T extends { deltaFromPrevious: number | null }>(points: T[], valueOf: (point: T) => number | null): Summary {
  let firstValue: number | null = null;
  let latestValue: number | null = null;
  let measured = 0;
  for (const point of points) {
    const value = valueOf(point);
    point.deltaFromPrevious = value === null || latestValue === null ? null : new Prisma.Decimal(value).minus(latestValue).toNumber();
    if (value !== null) {
      if (measured === 0) firstValue = value;
      latestValue = value;
      measured += 1;
    }
  }
  return { firstValue, latestValue, changeFromFirst: measured < 2 || firstValue === null || latestValue === null ? null : new Prisma.Decimal(latestValue).minus(firstValue).toNumber() };
}

/** Read stored, tenant-owned survey measurements and derive only percentage-point changes. */
export async function readSurveyTrends(institutionId: string, surveyId: string): Promise<SurveyTrendsResponse> {
  const read = async (): Promise<SurveyTrendsResponse> => {
    const survey = await prisma.survey.findFirst({
      where: { id: surveyId, institutionId },
      select: { id: true, nameAr: true, nameHe: true, academicYearId: true, archivedAt: true },
    });
    if (!survey) throw new HttpError(404, 'Survey was not found.', 'SURVEY_NOT_FOUND');

    const where = { institutionId, academicYearId: survey.academicYearId, surveyId: survey.id };
    const [rounds, indicators, domains, participation] = await Promise.all([
      prisma.surveyRound.findMany({ where, orderBy: [{ sequenceNumber: 'asc' }, { measurementDate: 'asc' }, { id: 'asc' }], select: { id: true, code: true, nameAr: true, nameHe: true, sequenceNumber: true, measurementDate: true, status: true } }),
      prisma.surveyIndicatorResult.findMany({ where, include: { indicator: true, domain: { include: { section: true } }, segment: true } }),
      prisma.surveyDomainResult.findMany({ where, include: { domain: { include: { section: true } }, segment: true } }),
      prisma.surveyParticipationResult.findMany({ where, include: { segment: true } }),
    ]);
    const indicatorGroups = new Map<string, { trend: IndicatorTrend; order: number[]; values: Map<string, { value: number | null; respondentCount: number | null }> }>();
    for (const row of indicators) {
      const key = `${row.indicatorId}:${row.segmentId}`;
      let group = indicatorGroups.get(key);
      if (!group) {
        const section = named(row.domain.section);
        group = { trend: { indicator: { id: row.indicator.id, code: row.indicator.code, textAr: row.indicator.textAr, textHe: row.indicator.textHe, isReverseDirection: row.indicator.isReverseDirection }, domain: domainItem(row.domain), section, segment: named(row.segment), points: [], firstValue: null, latestValue: null, changeFromFirst: null }, order: [row.domain.section.sortOrder, row.domain.sortOrder, row.indicator.sortOrder, row.segment.sortOrder], values: new Map() };
        indicatorGroups.set(key, group);
      }
      group.values.set(row.roundId, { value: numberOrNull(row.reportedPercentage), respondentCount: row.respondentCount });
    }
    const indicatorTrends = [...indicatorGroups.values()].sort((a, b) => a.order.reduce((difference, value, index) => difference || byNumber(value, b.order[index]!), 0) || byId(a.trend.section.id, b.trend.section.id) || byId(a.trend.domain.id, b.trend.domain.id) || byId(a.trend.indicator.id, b.trend.indicator.id) || byId(a.trend.segment.id, b.trend.segment.id)).map(({ trend, values }) => {
      trend.points = rounds.map((round) => ({ roundId: round.id, value: values.get(round.id)?.value ?? null, respondentCount: values.get(round.id)?.respondentCount ?? null, deltaFromPrevious: null }));
      Object.assign(trend, summarize(trend.points, (point) => point.value));
      return trend;
    });

    const domainGroups = new Map<string, { trend: DomainTrend; order: number[]; values: Map<string, { value: number | null; respondentCount: number | null; isComparable: boolean }> }>();
    for (const row of domains) {
      const key = `${row.domainId}:${row.segmentId}`;
      let group = domainGroups.get(key);
      if (!group) {
        group = { trend: { domain: domainItem(row.domain), section: named(row.domain.section), segment: named(row.segment), points: [], firstValue: null, latestValue: null, changeFromFirst: null }, order: [row.domain.section.sortOrder, row.domain.sortOrder, row.segment.sortOrder], values: new Map() };
        domainGroups.set(key, group);
      }
      group.values.set(row.roundId, { value: numberOrNull(row.scorePercentage), respondentCount: row.respondentCount, isComparable: row.isComparable });
    }
    const domainTrends = [...domainGroups.values()].sort((a, b) => a.order.reduce((difference, value, index) => difference || byNumber(value, b.order[index]!), 0) || byId(a.trend.section.id, b.trend.section.id) || byId(a.trend.domain.id, b.trend.domain.id) || byId(a.trend.segment.id, b.trend.segment.id)).map(({ trend, values }) => {
      trend.points = rounds.map((round) => ({ roundId: round.id, value: values.get(round.id)?.value ?? null, respondentCount: values.get(round.id)?.respondentCount ?? null, isComparable: values.get(round.id)?.isComparable ?? null, deltaFromPrevious: null }));
      Object.assign(trend, summarize(trend.points, (point) => point.value));
      return trend;
    });

    const participationGroups = new Map<string, { trend: ParticipationTrend; sortOrder: number; values: Map<string, { participantCount: number | null; eligibleCount: number | null; responseRate: number | null }> }>();
    for (const row of participation) {
      let group = participationGroups.get(row.segmentId);
      if (!group) {
        group = { trend: { segment: named(row.segment), points: [], firstValue: null, latestValue: null, changeFromFirst: null }, sortOrder: row.segment.sortOrder, values: new Map() };
        participationGroups.set(row.segmentId, group);
      }
      group.values.set(row.roundId, { participantCount: row.participantCount, eligibleCount: row.eligibleCount, responseRate: numberOrNull(row.responseRate) });
    }
    const participationTrends = [...participationGroups.values()].sort((a, b) => byNumber(a.sortOrder, b.sortOrder) || byId(a.trend.segment.id, b.trend.segment.id)).map(({ trend, values }) => {
      trend.points = rounds.map((round) => ({ roundId: round.id, participantCount: values.get(round.id)?.participantCount ?? null, eligibleCount: values.get(round.id)?.eligibleCount ?? null, responseRate: values.get(round.id)?.responseRate ?? null, deltaFromPrevious: null }));
      Object.assign(trend, summarize(trend.points, (point) => point.responseRate));
      return trend;
    });

    return { survey, rounds, indicatorTrends, domainTrends, participationTrends };
  };
  return getRequestTransaction() ? read() : withRlsContext(institutionId, read);
}
