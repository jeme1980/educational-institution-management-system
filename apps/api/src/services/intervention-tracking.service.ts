import { buildDimensionProgressPoint, DimensionExamInput } from './progress-tracking.service';

export const INTERVENTION_STATUSES = ['planned', 'active', 'completed', 'cancelled'] as const;
export type InterventionStatus = typeof INTERVENTION_STATUSES[number];
export type InterventionOutcome = 'improved' | 'declined' | 'noComparison';

export interface InterventionCriterion {
  targetMasteryPercentage?: number | null;
  displayText?: string | null;
}

export interface InterventionOutcomeSummary {
  outcome: InterventionOutcome;
  criterionMet: boolean | null;
  baselineMastery: number | null;
  latestMastery: number | null;
  change: number | null;
  targetedStudentCount: number;
  measuredStudentCount: number;
  coverage: number;
}

export function normalizeInterventionCriterion(value: unknown): InterventionCriterion {
  if (!value || typeof value !== 'object') return {};
  const input = value as Record<string, unknown>;
  const target = input.targetMasteryPercentage === null || input.targetMasteryPercentage === undefined || input.targetMasteryPercentage === '' ? null : Number(input.targetMasteryPercentage);
  return {
    targetMasteryPercentage: target !== null && Number.isFinite(target) && target >= 0 && target <= 100 ? target : null,
    displayText: input.displayText ? String(input.displayText).trim() : null,
  };
}

export function evaluateInterventionOutcome(baselineMastery: number | null, latestMastery: number | null, targetMasteryPercentage: number | null, targetedStudentCount: number, measuredStudentCount: number): InterventionOutcomeSummary {
  const change = baselineMastery !== null && latestMastery !== null ? Number((latestMastery - baselineMastery).toFixed(2)) : null;
  const outcome: InterventionOutcome = change === null || change === 0 ? 'noComparison' : change > 0 ? 'improved' : 'declined';
  return {
    outcome,
    criterionMet: latestMastery === null || targetMasteryPercentage === null ? null : latestMastery >= targetMasteryPercentage,
    baselineMastery,
    latestMastery,
    change,
    targetedStudentCount,
    measuredStudentCount,
    coverage: targetedStudentCount ? Number((measuredStudentCount / targetedStudentCount * 100).toFixed(2)) : 0,
  };
}

export function measuredStudentIds(exam: DimensionExamInput, dimensionId: string): string[] {
  const questionIds = new Set(exam.questions.filter((question) => question.dimensionId === dimensionId).map((question) => question.id));
  return [...new Set(exam.scores.filter((score) => questionIds.has(score.questionId) && exam.participantIds.includes(score.studentId)).map((score) => score.studentId))];
}

export function buildOutcomeMeasurement(exam: DimensionExamInput, dimensionId: string, targetedStudentCount: number) {
  const point = buildDimensionProgressPoint(exam, dimensionId);
  const measuredStudentCount = measuredStudentIds(exam, dimensionId).length;
  return { ...point, measuredStudentCount, coverage: targetedStudentCount ? Number((measuredStudentCount / targetedStudentCount * 100).toFixed(2)) : 0 };
}
