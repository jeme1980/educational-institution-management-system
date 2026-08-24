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
