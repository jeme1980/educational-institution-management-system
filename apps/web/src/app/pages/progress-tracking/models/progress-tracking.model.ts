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

export interface ProgressTrackingResponse {
  context: {
    academicYear: { id: string; yearLabel: string };
    subject: { id: string; nameAr: string; nameHe?: string | null };
    studyGroup: { id: string; nameAr: string; classId?: string | null; subjectId: string };
  };
  summary: { examsCount: number; firstAverage: number | null; latestAverage: number | null; averageChange: number | null };
  points: ProgressTrackingPoint[];
}
