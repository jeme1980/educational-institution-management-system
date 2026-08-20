import { z } from 'zod';

export const attendanceStatusSchema = z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']);

export const attendanceSchema = z.object({
  attendanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Attendance date must use YYYY-MM-DD format.'),
  status: attendanceStatusSchema,
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const attendanceUpdateSchema = attendanceSchema;

export type AttendanceInput = z.infer<typeof attendanceSchema>;
