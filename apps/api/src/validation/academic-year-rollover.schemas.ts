import { z } from 'zod';

export const academicYearRolloverPreviewSchema = z.object({
  sourceAcademicYearId: z.string().uuid(),
  targetAcademicYearId: z.string().uuid(),
}).strict();

export type AcademicYearRolloverPreviewInput = z.infer<typeof academicYearRolloverPreviewSchema>;
