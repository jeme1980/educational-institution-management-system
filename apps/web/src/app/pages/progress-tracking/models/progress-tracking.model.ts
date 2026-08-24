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

export type StudentParticipationStatus = 'completed' | 'absent' | 'missing';

export interface StudentProgressPoint extends ProgressTrackingPoint {
  participationStatus: StudentParticipationStatus;
  studentScore: number | null;
  studentPercentage: number | null;
  groupAveragePercentage: number | null;
  groupPassRate: number | null;
  groupParticipantCount: number;
  gapFromGroup: number | null;
}

export interface StudentProgressResponse {
  context: ProgressTrackingResponse['context'];
  student: { id: string; firstNameAr: string; lastNameAr: string; nationalId?: string | null };
  summary: { examsCount: number; completedCount: number; firstPercentage: number | null; latestPercentage: number | null; change: number | null; currentGroupGap: number | null };
  points: StudentProgressPoint[];
}
