import { z } from 'zod';

const classFields = {
  institutionId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
  stageId: z.string().uuid(),
  gradeLevelId: z.string().uuid(),
  parallelNumber: z.coerce.number().int().min(1),
  nameAr: z.string().trim().min(1).max(120),
  nameHe: z.string().trim().max(120).nullable().optional(),
  typeId: z.string().uuid(),
  compositionId: z.string().uuid(),
  // Read-only for clients; the API recalculates it from gradeLevel.codeNumber.
  classCode: z.string().trim().max(20).nullable().optional(),
};

export const classSchema = z.object(classFields);
export const classUpdateSchema = classSchema;

export type ClassInput = z.infer<typeof classSchema>;
