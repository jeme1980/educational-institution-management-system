import { z } from 'zod';

export const academicYearRolloverPreviewSchema = z.object({
  sourceAcademicYearId: z.string().uuid(),
  targetAcademicYearId: z.string().uuid(),
}).strict();

export type AcademicYearRolloverPreviewInput = z.infer<typeof academicYearRolloverPreviewSchema>;

export const academicYearRolloverDraftSchema = academicYearRolloverPreviewSchema;

const mappingFields = z.object({
  action: z.enum(['CREATE', 'USE_EXISTING', 'SKIP']),
  targetStageId: z.string().uuid().nullable().optional(),
  targetGradeLevelId: z.string().uuid().nullable().optional(),
  targetClassId: z.string().uuid().nullable().optional(),
  targetParallelNumber: z.number().int().positive().nullable().optional(),
  targetNameAr: z.string().trim().min(1).max(120).nullable().optional(),
  targetNameHe: z.string().trim().min(1).max(120).nullable().optional(),
}).strict();
export const academicYearRolloverClassMappingPatchSchema = mappingFields;

const decisionFields = z.object({
  action: z.enum(['PROMOTE', 'REPEAT', 'GRADUATE', 'SKIP']).nullable(),
  targetGradeLevelId: z.string().uuid().nullable().optional(),
  targetClassMappingId: z.string().uuid().nullable().optional(),
}).strict();
export const academicYearRolloverStudentDecisionPatchSchema = decisionFields;
export const academicYearRolloverStudentDecisionBulkSchema = decisionFields.extend({ decisionIds: z.array(z.string().uuid()).min(1).max(500) }).strict();
