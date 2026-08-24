import { isPassingPercentage } from './exam-metrics.service';

export interface ProgressTrackingExamRow {
  id: string;
  titleAr: string;
  examDate: Date;
  maxScore: number;
  examType: { id: string; nameAr: string } | null;
  results: Array<{ studentId: string; totalScore: number; isAbsence: boolean }>;
  eligibleStudentIds: string[];
}

export interface ProgressTrackingPoint {
  examId: string;
  examName: string;
  examDate: string;
  examType: { id: string; nameAr: string } | null;
  maxScore: number;
  participantCount: number;
  eligibleCount: number;
  averagePercentage: number | null;
  passRate: number | null;
  noData: boolean;
}

export type StudentParticipationStatus = 'completed' | 'absent' | 'missing';

export type ProgressDimension = 'skill' | 'topic';
export type DimensionProgressStatus = 'measured' | 'notMeasured' | 'detailUnavailable';

export interface DimensionQuestionInput {
  id: string;
  maxPoints: number;
  dimensionId: string | null;
  dimensionName: string | null;
}

export interface DimensionScoreInput {
  studentId: string;
  questionId: string;
  score: number;
}

export interface DimensionExamInput {
  examId: string;
  examName: string;
  examDate: string;
  questions: DimensionQuestionInput[];
  participantIds: string[];
  scores: DimensionScoreInput[];
}

export interface DimensionProgressPoint {
  examId: string;
  examName: string;
  examDate: string;
  status: DimensionProgressStatus;
  masteryRate: number | null;
  questionCount: number;
  maxPoints: number;
  participantCount: number;
  unansweredRate: number | null;
}

export function buildDimensionProgressPoint(exam: DimensionExamInput, dimensionId: string): DimensionProgressPoint {
  const questions = exam.questions.filter((question) => question.dimensionId === dimensionId);
  const base = {
    examId: exam.examId,
    examName: exam.examName,
    examDate: exam.examDate,
    questionCount: questions.length,
    maxPoints: Number(questions.reduce((sum, question) => sum + question.maxPoints, 0).toFixed(2)),
    participantCount: exam.participantIds.length,
  };
  if (!questions.length) return { ...base, status: 'notMeasured', masteryRate: null, unansweredRate: null };

  const questionIds = new Set(questions.map((question) => question.id));
  const scores = exam.scores.filter((score) => questionIds.has(score.questionId) && exam.participantIds.includes(score.studentId));
  if (!scores.length || !exam.participantIds.length || !base.maxPoints) return { ...base, status: 'detailUnavailable', masteryRate: null, unansweredRate: null };

  const scoreByStudent = new Map<string, Map<string, number>>();
  for (const score of scores) {
    const byQuestion = scoreByStudent.get(score.studentId) || new Map<string, number>();
    byQuestion.set(score.questionId, score.score);
    scoreByStudent.set(score.studentId, byQuestion);
  }
  const masteryValues = exam.participantIds.map((studentId) => {
    const byQuestion = scoreByStudent.get(studentId) || new Map<string, number>();
    return questions.reduce((sum, question) => sum + Number(byQuestion.get(question.id) || 0), 0) / base.maxPoints * 100;
  });
  const unanswered = exam.participantIds.reduce((sum, studentId) => {
    const byQuestion = scoreByStudent.get(studentId) || new Map<string, number>();
    return sum + questions.filter((question) => !byQuestion.has(question.id)).length;
  }, 0);
  return {
    ...base,
    status: 'measured',
    masteryRate: Number((masteryValues.reduce((sum, value) => sum + value, 0) / masteryValues.length).toFixed(2)),
    unansweredRate: Number((unanswered / (exam.participantIds.length * questions.length) * 100).toFixed(2)),
  };
}

export interface StudentProgressExamRow extends ProgressTrackingPoint {
  participationStatus: StudentParticipationStatus;
  studentScore: number | null;
  studentPercentage: number | null;
  groupAveragePercentage: number | null;
  groupPassRate: number | null;
  groupParticipantCount: number;
  gapFromGroup: number | null;
}

export function buildStudentProgressPoints(
  points: ProgressTrackingPoint[],
  studentResults: Map<string, { totalScore: number; isAbsence: boolean }>,
): StudentProgressExamRow[] {
  return points.map((point) => {
    const result = studentResults.get(point.examId);
    const participationStatus: StudentParticipationStatus = result?.isAbsence ? 'absent' : result ? 'completed' : 'missing';
    const studentScore = participationStatus === 'completed' ? result!.totalScore : null;
    const studentPercentage = studentScore !== null && point.maxScore > 0 ? Number((studentScore / point.maxScore * 100).toFixed(2)) : null;
    const gapFromGroup = studentPercentage !== null && point.averagePercentage !== null
      ? Number((studentPercentage - point.averagePercentage).toFixed(2))
      : null;
    return {
      ...point,
      participationStatus,
      studentScore,
      studentPercentage,
      groupAveragePercentage: point.averagePercentage,
      groupPassRate: point.passRate,
      groupParticipantCount: point.participantCount,
      gapFromGroup,
    };
  });
}

export function buildProgressTrackingPoints(rows: ProgressTrackingExamRow[]): ProgressTrackingPoint[] {
  return [...rows]
    .sort((left, right) => left.examDate.getTime() - right.examDate.getTime() || left.id.localeCompare(right.id))
    .map((exam) => {
      const eligible = new Set(exam.eligibleStudentIds);
      const attended = exam.results.filter((result) => eligible.has(result.studentId) && !result.isAbsence && exam.maxScore > 0);
      const percentages = attended.map((result) => Number((result.totalScore / exam.maxScore * 100).toFixed(2)));
      const participantCount = percentages.length;
      const averagePercentage = participantCount ? Number((percentages.reduce((sum, value) => sum + value, 0) / participantCount).toFixed(2)) : null;
      const passRate = participantCount ? Number((percentages.filter(isPassingPercentage).length / participantCount * 100).toFixed(2)) : null;
      return {
        examId: exam.id,
        examName: exam.titleAr,
        examDate: exam.examDate.toISOString().slice(0, 10),
        examType: exam.examType,
        maxScore: exam.maxScore,
        participantCount,
        eligibleCount: eligible.size,
        averagePercentage,
        passRate,
        noData: participantCount === 0,
      };
    });
}
