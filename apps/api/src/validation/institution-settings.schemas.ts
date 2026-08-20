import { z } from 'zod';

/** Fields that a school administrator may edit from the institution settings screen. */
export const institutionSettingsUpdateSchema = z.object({
  nameAr: z.string().trim().min(1).max(200),
  nameHe: z.string().trim().max(200).nullable().optional(),
  phoneNumber: z.string().trim().max(50).nullable().optional(),
  email: z.string().trim().email().max(250).nullable().optional(),
  logoUrl: z.string().trim().url().max(2048).nullable().optional(),
}).strict();

export type InstitutionSettingsUpdate = z.infer<typeof institutionSettingsUpdateSchema>;
