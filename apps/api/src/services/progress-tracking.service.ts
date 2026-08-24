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

export function buildProgressTrackingPoints(rows: ProgressTrackingExamRow[]): ProgressTrackingPoint[] {
  return [...rows]
    .sort((left, right) => left.examDate.getTime() - right.examDate.getTime() || left.id.localeCompare(right.id))
    .map((exam) => {
      const eligible = new Set(exam.eligibleStudentIds);
      const attended = exam.results.filter((result) => eligible.has(result.studentId) && !result.isAbsence && exam.maxScore > 0);
      const percentages = attended.map((result) => Number((result.totalScore / exam.maxScore * 100).toFixed(2)));
      const participantCount = percentages.length;
      const averagePercentage = participantCount ? Number((percentages.reduce((sum, value) => sum + value, 0) / participantCount).toFixed(2)) : null;
      const passRate = participantCount ? Number((percentages.filter((value) => value >= 50).length / participantCount * 100).toFixed(2)) : null;
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
