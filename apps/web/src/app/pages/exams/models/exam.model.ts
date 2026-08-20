export type { ExamItem } from '../../../core/models/api.models';

export interface QuestionRow {
  id?: string;
  questionNumber: number;
  questionTypeId: string;
  topicId?: string | null;
  skillId?: string | null;
  maxScore: number;
  contentAr?: string | null;
  contentHe?: string | null;
}
