import { z } from 'zod';

const optionalText = (max = 500) => z.string().trim().max(max).nullable().optional();
const optionalDate = z.union([z.coerce.date(), z.literal('')]).nullable().optional();

export const medicalProfileSchema = z.object({
  bloodType: optionalText(10),
  allergiesDescription: optionalText(2000),
  chronicConditions: optionalText(2000),
  emergencyInstructions: optionalText(2000),
  hasSpecialNeeds: z.boolean().optional(),
  specialNeedsNotes: optionalText(2000),
});

const guardianSchema = z.object({
  nationalId: optionalText(50),
  firstNameAr: z.string().trim().min(1).max(150),
  lastNameAr: z.string().trim().min(1).max(150),
  firstNameHe: optionalText(150),
  lastNameHe: optionalText(150),
  primaryPhoneNumber: z.string().trim().min(3).max(50),
  secondaryPhoneNumber: optionalText(50),
  email: z.union([z.literal(''), z.string().trim().email()]).nullable().optional(),
  addressAr: optionalText(10000),
  addressHe: optionalText(10000),
  jobTitleAr: optionalText(150),
  jobTitleHe: optionalText(150),
});

export const guardianCreateSchema = guardianSchema.extend({
  guardianId: z.string().uuid().optional(),
  relationTypeId: z.string().trim().min(1).max(100),
  isPrimaryContact: z.boolean().optional(),
  isFinancialResponsible: z.boolean().optional(),
  hasCustody: z.boolean().optional(),
  canPickup: z.boolean().optional(),
});

export const guardianUpdateSchema = guardianCreateSchema.partial().refine((body) => Object.keys(body).length > 0, {
  message: 'At least one guardian field is required',
});

export const studentSchema = z.object({
  nationalId: z.string().trim().min(1).max(10),
  firstNameAr: z.string().trim().min(1).max(150),
  lastNameAr: z.string().trim().min(1).max(150),
  firstNameHe: optionalText(150),
  lastNameHe: optionalText(150),
  genderId: optionalText(100),
  studentStatusId: z.string().trim().min(1).max(100),
  birthDate: optionalDate,
  photoUrl: optionalText(1000),
  email: z.union([z.literal(''), z.string().trim().email()]).nullable().optional(),
  phoneNumber: optionalText(50),
  addressAr: optionalText(10000),
  addressHe: optionalText(10000),
  townId: optionalText(100),
  notes: optionalText(10000),
  isActive: z.boolean().optional(),
  classId: optionalText(100),
  academicYearId: optionalText(100),
  medicalProfile: medicalProfileSchema.nullable().optional(),
  guardian: guardianSchema.nullable().optional(),
  relationTypeId: optionalText(100),
});

export const studentUpdateSchema = studentSchema.partial().refine(
  (body) => Object.keys(body).length > 0,
  { message: 'At least one student field is required' },
);

export const studentEnrollmentSchema = z.object({
  studentId: z.string().trim().min(1).max(100),
  classRoomId: z.string().trim().min(1).max(100),
  studentFeatureId: z.union([z.string().uuid(), z.literal('')]).nullable().optional(),
  startDate: optionalDate,
  notes: optionalText(4000),
});

export const studentEnrollmentUpdateSchema = z.object({
  classRoomId: z.string().trim().min(1).max(100).optional(),
  studentFeatureId: z.union([z.string().uuid(), z.literal('')]).nullable().optional(),
  startDate: optionalDate,
  endDate: optionalDate,
  isActive: z.boolean().optional(),
  notes: optionalText(4000),
}).refine((body) => Object.keys(body).length > 0, {
  message: 'At least one enrollment field is required',
});

export type StudentInput = z.infer<typeof studentSchema>;
