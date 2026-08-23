export type AnalysisTab = 'overview' | 'students' | 'questions' | 'skills' | 'topics' | 'comparisons' | 'recommendations' | 'intervention';

export interface PerformanceLevel {
  id: string;
  name: string;
  min: number;
  max: number;
  color: string;
}

export interface AnalysisQuestion {
  id: string;
  questionNumber: number;
  points: number;
  topicId: string;
  topicName: string;
  skillId: string;
  skillName: string;
  typeId: string;
  typeName: string;
  text?: string;
  correctAnswer?: string;
}

export interface AnalysisStudent {
  studentId: string;
  studentName: string;
  studentNumber?: string;
  groupId?: string;
  groupIds?: string[];
  groupName?: string;
  totalScore: number | null;
  isAbsent: boolean;
  questionScores: { questionId: string; achievedScore: number | null }[];
}

export interface ExamAnalysisDataset {
  exam: any;
  students: AnalysisStudent[];
  questions: AnalysisQuestion[];
  groups: any[];
  backendAnalysis?: any;
}

export interface StudentAnalysis extends AnalysisStudent {
  normalizedScore: number;
  level: PerformanceLevel;
  correct: number;
  wrong: number;
  unanswered: number;
}

export interface QuestionAnalysis extends AnalysisQuestion {
  average: number;
  successRate: number;
  errorRate: number;
  unansweredRate: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  difficulty: 'سهل' | 'متوسط' | 'صعب';
  level: PerformanceLevel;
}

export interface DimensionAnalysis {
  id: string;
  name: string;
  questionCount: number;
  maxPoints: number;
  averagePerformance: number;
  masteryRate: number;
  masteredStudents: number;
  supportStudents: number;
  unansweredRate: number;
  level: PerformanceLevel;
}

export interface AnalysisSummary {
  registered: number;
  attended: number;
  absent: number;
  average: number;
  highest: number;
  lowest: number;
  median: number;
  standardDeviation: number;
  passRate: number;
  averageCorrect: number;
  averageWrong: number;
  averageUnanswered: number;
}

export const DEFAULT_PERFORMANCE_LEVELS: PerformanceLevel[] = [
  { id: 'high', name: 'مرتفع', min: 85, max: 100, color: '#16a34a' },
  { id: 'upper-mid', name: 'متوسط مرتفع', min: 70, max: 84.99, color: '#2563eb' },
  { id: 'lower-mid', name: 'متوسط منخفض', min: 55, max: 69.99, color: '#f59e0b' },
  { id: 'low', name: 'منخفض', min: 0, max: 54.99, color: '#dc2626' },
];
