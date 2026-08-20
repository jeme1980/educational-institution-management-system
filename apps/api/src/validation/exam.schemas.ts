import { z } from 'zod';

const optionalText = (max = 500) => z.string().trim().max(max).nullable().optional();
const positiveDecimal = z.coerce.number().finite().nonnegative();

export const examSchema = z.object({
  academicYearId: optionalText(100),
  academicPeriodId: optionalText(100),
  subjectId: z.string().trim().min(1).max(100),
  classId: optionalText(100),
  typeId: z.string().trim().min(1).max(100),
  statusId: optionalText(100),
  titleAr: z.string().trim().min(1).max(250),
  examDate: z.coerce.date(),
  startTime: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  durationMinutes: z.coerce.number().int().positive().max(1440).optional(),
  roomLocation: optionalText(250),
  maxScore: positiveDecimal.optional(),
});

export const examUpdateSchema = examSchema.partial().refine(
  (body) => Object.keys(body).length > 0,
  { message: 'At least one exam field is required' },
);

const nullableScore = z.union([z.number(), z.string().trim(), z.null()]).transform((value) => {
  if (value === null || value === '') return null;
  return Number(value);
}).refine((value) => value === null || Number.isFinite(value), 'Score must be numeric.').refine((value) => value === null || value >= 0, 'Score cannot be negative.');

const resultSchema = z.object({
  resultId: optionalText(100),
  studentId: z.string().trim().min(1).max(100),
  studyGroupStudentId: optionalText(100),
  totalScore: nullableScore.optional(),
  isAbsent: z.boolean().optional(),
  isAbsence: z.boolean().optional(),
  absenceReason: optionalText(4000),
  statusId: optionalText(100),
  notes: optionalText(4000),
  questionScores: z.array(z.object({
    questionId: z.string().trim().min(1).max(100),
    score: nullableScore.optional(),
    achievedScore: nullableScore.optional(),
    notes: optionalText(4000),
  })).optional(),
});

export const examResultsSchema = z.object({ results: z.array(resultSchema) });

export const examGroupResultsSchema = examResultsSchema.extend({
  examStudyGroupId: optionalText(100),
});

export const examQuestionsSchema = z.object({
  questions: z.array(z.object({
    id: optionalText(100),
    questionNumber: z.coerce.number().int().positive(),
    topicId: z.string().trim().min(1).max(100),
    skillId: z.string().trim().min(1).max(100),
    questionTypeId: z.string().trim().min(1).max(100),
    points: positiveDecimal,
  })),
});

export const examStudyGroupsSchema = z.object({
  studyGroupIds: z.array(z.string().trim().min(1).max(100)),
});

export const examLookupSchema = z.object({
  code: z.string().trim().min(1).max(100).optional(),
  nameAr: z.string().trim().min(1).max(250),
  nameHe: optionalText(250),
  isActive: z.boolean().optional(),
  displayOrder: z.coerce.number().int().nonnegative().optional(),
  archivedAt: z.coerce.date().nullable().optional(),
});

export const examLookupUpdateSchema = examLookupSchema.partial().refine(
  (body) => Object.keys(body).length > 0,
  { message: 'At least one lookup field is required' },
);

export type ExamInput = z.infer<typeof examSchema>;
