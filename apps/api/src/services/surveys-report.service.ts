import { getRequestTransaction, prisma } from '../db/prisma';
import { HttpError } from '../middleware/errorHandler.middleware';
import { withRlsContext } from '../middleware/rls-request.middleware';
import { readSurveyRoundResults, type SurveyRoundResultsResponse } from './surveys-results-read.service';
import { readSurveyTrends, type SurveyTrendsResponse } from './surveys-trends.service';
import { readSurveyComparisons, type SurveyComparisonsResponse } from './surveys-comparisons.service';

type ReportRound = SurveyTrendsResponse['rounds'][number];
interface ReportSegment { id: string; code: string; nameAr: string; nameHe: string | null; segmentType: string | null; sortOrder: number }

export interface SurveyReportResponse {
  survey: {
    id: string; academicYearId: string; nameAr: string; nameHe: string | null;
    descriptionAr: string | null; descriptionHe: string | null; audienceType: string | null;
    status: string; archivedAt: Date | null;
  };
  rounds: ReportRound[];
  segments: ReportSegment[];
  selectedRound: ReportRound | null;
  selectedSegment: ReportSegment | null;
  snapshot: {
    indicatorResults: SurveyRoundResultsResponse['indicatorResults'];
    domainResults: SurveyRoundResultsResponse['domainResults'];
    participation: SurveyRoundResultsResponse['participation'][number] | null;
  };
  trends: {
    indicatorTrends: SurveyTrendsResponse['indicatorTrends'];
    domainTrends: SurveyTrendsResponse['domainTrends'];
    participationTrend: SurveyTrendsResponse['participationTrends'][number] | null;
  };
  comparisons: SurveyComparisonsResponse['groups'];
}

/** Compose existing read contracts without changing their stored or derived values. */
export async function readSurveyReport(institutionId: string, surveyId: string, roundId?: string, segmentId?: string): Promise<SurveyReportResponse> {
  const read = async (): Promise<SurveyReportResponse> => {
    const survey = await prisma.survey.findFirst({
      where: { id: surveyId, institutionId },
      select: { id: true, academicYearId: true, nameAr: true, nameHe: true, descriptionAr: true, descriptionHe: true, audienceType: true, status: true, archivedAt: true },
    });
    if (!survey) throw new HttpError(404, 'Survey was not found.', 'SURVEY_NOT_FOUND');

    const where = { institutionId, academicYearId: survey.academicYearId, surveyId: survey.id };
    const [rounds, segments, indicatorKeys, domainKeys, comparisonKeys, participationKeys] = await Promise.all([
      prisma.surveyRound.findMany({ where, orderBy: [{ sequenceNumber: 'asc' }, { measurementDate: 'asc' }, { id: 'asc' }], select: { id: true, code: true, nameAr: true, nameHe: true, sequenceNumber: true, measurementDate: true, status: true } }),
      prisma.surveySegment.findMany({ where: { institutionId, surveyId: survey.id }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, code: true, nameAr: true, nameHe: true, segmentType: true, sortOrder: true } }),
      prisma.surveyIndicatorResult.findMany({ where, select: { roundId: true, segmentId: true } }),
      prisma.surveyDomainResult.findMany({ where, select: { roundId: true, segmentId: true } }),
      prisma.surveyDomainComparison.findMany({ where, select: { roundId: true, segmentId: true } }),
      prisma.surveyParticipationResult.findMany({ where, select: { roundId: true, segmentId: true } }),
    ]);

    const explicitRound = roundId ? rounds.find(round => round.id === roundId) : undefined;
    if (roundId && !explicitRound) throw new HttpError(404, 'Survey round was not found.', 'SURVEY_ROUND_NOT_FOUND');
    const explicitSegment = segmentId ? segments.find(segment => segment.id === segmentId) : undefined;
    if (segmentId && !explicitSegment) throw new HttpError(404, 'Survey segment was not found.', 'SURVEY_SEGMENT_NOT_FOUND');

    const keys = [...indicatorKeys, ...domainKeys, ...comparisonKeys, ...participationKeys];
    const roundsWithData = new Set(keys.map(item => item.roundId));
    const selectedRound = explicitRound ?? [...rounds].reverse().find(round => roundsWithData.has(round.id)) ?? null;
    const segmentsWithData = new Set(keys.filter(item => item.roundId === selectedRound?.id).map(item => item.segmentId));
    const selectedSegment = selectedRound && segmentsWithData.size
      ? explicitSegment ?? segments.find(segment => segmentsWithData.has(segment.id)) ?? null
      : null;

    const emptySnapshot: SurveyReportResponse['snapshot'] = { indicatorResults: [], domainResults: [], participation: null };
    const emptyTrends: SurveyReportResponse['trends'] = { indicatorTrends: [], domainTrends: [], participationTrend: null };
    if (!selectedRound || !selectedSegment) {
      return { survey, rounds, segments, selectedRound, selectedSegment, snapshot: emptySnapshot, trends: emptyTrends, comparisons: [] };
    }

    const [roundResults, allTrends, allComparisons] = await Promise.all([
      readSurveyRoundResults(institutionId, surveyId, selectedRound.id),
      readSurveyTrends(institutionId, surveyId),
      readSurveyComparisons(institutionId, surveyId),
    ]);
    const selectedSegmentId = selectedSegment.id;
    return {
      survey, rounds, segments, selectedRound, selectedSegment,
      snapshot: {
        indicatorResults: roundResults.indicatorResults.filter(item => item.segment.id === selectedSegmentId),
        domainResults: roundResults.domainResults.filter(item => item.segment.id === selectedSegmentId),
        participation: roundResults.participation.find(item => item.segment.id === selectedSegmentId) ?? null,
      },
      trends: {
        indicatorTrends: allTrends.indicatorTrends.filter(item => item.segment.id === selectedSegmentId),
        domainTrends: allTrends.domainTrends.filter(item => item.segment.id === selectedSegmentId),
        participationTrend: allTrends.participationTrends.find(item => item.segment.id === selectedSegmentId) ?? null,
      },
      comparisons: allComparisons.groups.filter(item => item.roundId === selectedRound.id && item.segmentId === selectedSegmentId),
    };
  };
  return getRequestTransaction() ? read() : withRlsContext(institutionId, read);
}
