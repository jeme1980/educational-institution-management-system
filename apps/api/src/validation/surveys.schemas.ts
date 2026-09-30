import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().min(1).max(max).nullable().optional();
const code = text(80);
const sortOrder = z.number().int().min(0).max(1_000_000).optional();
const status = z.enum(['DRAFT', 'ACTIVE', 'CLOSED']);
const roundStatus = z.enum(['PLANNED', 'OPEN', 'CLOSED']);
export const surveyRoundResultsParamsSchema = z.object({ surveyId: z.string().uuid(), roundId: z.string().uuid() });

export const createSurveySchema = z.object({
  academicYearId: z.string().uuid(), nameAr: text(500), nameHe: optionalText(500),
  descriptionAr: optionalText(10_000), descriptionHe: optionalText(10_000), audienceType: optionalText(40),
  status: status.optional(),
});
export const updateSurveySchema = z.object({
  nameAr: text(500).optional(), nameHe: optionalText(500), descriptionAr: optionalText(10_000), descriptionHe: optionalText(10_000),
  audienceType: optionalText(40), isActive: z.boolean().optional(), status: status.optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

export const createSectionSchema = z.object({ code, nameAr: text(500), nameHe: optionalText(500), descriptionAr: optionalText(10_000), descriptionHe: optionalText(10_000), sortOrder, isOptional: z.boolean().optional(), isActive: z.boolean().optional() });
export const updateSectionSchema = createSectionSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required.');
export const createDomainSchema = z.object({ sectionId: z.string().uuid(), code, nameAr: text(500), nameHe: optionalText(500), descriptionAr: optionalText(10_000), descriptionHe: optionalText(10_000), sortOrder, isActive: z.boolean().optional() });
export const updateDomainSchema = createDomainSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required.');
export const createIndicatorSchema = z.object({ domainId: z.string().uuid(), code, textAr: text(10_000), textHe: optionalText(10_000), descriptionAr: optionalText(10_000), descriptionHe: optionalText(10_000), sortOrder, isActive: z.boolean().optional(), reportingRuleCode: z.enum(['AGREEMENT_TOP_2', 'FREQUENCY_TOP_2', 'FREQUENCY_TOP_3', 'DIRECT_PERCENT']).nullable().optional(), isReverseDirection: z.boolean().optional() });
export const updateIndicatorSchema = createIndicatorSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required.');
export const createRoundSchema = z.object({ code, nameAr: text(500), nameHe: optionalText(500), sequenceNumber: z.number().int().min(1), startsAt: z.coerce.date().nullable().optional(), endsAt: z.coerce.date().nullable().optional(), measurementDate: z.coerce.date().nullable().optional(), status: roundStatus.optional() });
export const updateRoundSchema = createRoundSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required.');
export const createSegmentSchema = z.object({ code, nameAr: text(500), nameHe: optionalText(500), segmentType: optionalText(40), sortOrder, isActive: z.boolean().optional() });
export const updateSegmentSchema = createSegmentSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required.');
