import type { PrismaClient } from '@prisma/client';
import { hashPassword } from '../security/password';

export const systemIds = {
  region: '00000000-0000-4000-8000-000000000002', town: '00000000-0000-4000-8000-000000000003',
  status: '00000000-0000-4000-8000-000000000004', language: '00000000-0000-4000-8000-000000000005',
  educationType: '00000000-0000-4000-8000-000000000006', educationStage: '00000000-0000-4000-8000-00000000000f',
  classType: '00000000-0000-4000-8000-000000000010', compositionType: '00000000-0000-4000-8000-000000000011',
  genderUnknown: '00000000-0000-4000-8000-000000000008', genderMale: '00000000-0000-4000-8000-00000000001a',
  genderFemale: '00000000-0000-4000-8000-00000000001b', studentStatus: '00000000-0000-4000-8000-000000000009',
  enrollmentStatus: '00000000-0000-4000-8000-00000000000a', relationType: '00000000-0000-4000-8000-00000000000b',
  studentFeatureNormal: '00000000-0000-4000-8000-00000000000f', studentFeatureMerged: '00000000-0000-4000-8000-000000000012',
} as const;

const gradeLevels = Array.from({ length: 12 }, (_, index) => ({
  id: `00000000-0000-4000-8000-0000000001${String(index + 1).padStart(2, '0')}`,
  codeNumber: index + 1, nameAr: `الطبقة ${index + 1}`, nameHe: `שכבה ${index + 1}`, sortOrder: index + 1,
}));

const permissions = [
  ['students', 'CREATE', 'إضافة طالب'], ['students', 'READ', 'عرض الطلاب'], ['students', 'UPDATE', 'تعديل طالب'], ['students', 'DELETE', 'حذف طالب'],
  ['teachers', 'CREATE', 'إضافة موظف'], ['teachers', 'READ', 'عرض الكادر'], ['teachers', 'UPDATE', 'تعديل موظف'], ['teachers', 'DELETE', 'حذف موظف'],
  ['exams', 'CREATE', 'إنشاء امتحان'], ['exams', 'READ', 'عرض الامتحانات والنتائج'], ['exams', 'UPDATE', 'تعديل الامتحانات والنتائج'], ['exams', 'DELETE', 'حذف امتحان'],
  ['settings', 'CREATE', 'إدارة إعدادات النظام'], ['settings', 'READ', 'عرض الإعدادات والجداول'], ['settings', 'UPDATE', 'تعديل إعدادات المؤسسة'],
  ['attendance', 'READ', 'عرض الحضور'], ['attendance', 'CREATE', 'تسجيل الحضور'], ['attendance', 'UPDATE', 'تعديل الحضور'], ['attendance', 'DELETE', 'حذف سجل الحضور'],
  ['subscription', 'READ', 'عرض حالة الاشتراك'], ['guardian', 'READ', 'عرض أولياء الأمور'], ['guardian', 'CREATE', 'إضافة ولي أمر'],
  ['guardian', 'UPDATE', 'تعديل ولي أمر'], ['guardian', 'DELETE', 'إزالة ارتباط ولي الأمر'], ['medical-profile', 'READ', 'عرض الملف الطبي'],
  ['medical-profile', 'UPDATE', 'تعديل الملف الطبي'],
] as const;

export async function bootstrapSystemData(client: PrismaClient): Promise<void> {
  await client.region.upsert({ where: { id: systemIds.region }, update: { isActive: true }, create: { id: systemIds.region, nameAr: 'المنطقة الوسطى', nameHe: 'המרכז', sortOrder: 1 } });
  await client.institutionStatus.upsert({ where: { id: systemIds.status }, update: { isActive: true }, create: { id: systemIds.status, schoolCode: 'ACTIVE', nameAr: 'نشطة', nameHe: 'פעילה', isSystem: true } });
  await client.language.upsert({ where: { id: systemIds.language }, update: { isActive: true }, create: { id: systemIds.language, nameAr: 'العربية', nameHe: 'ערבית', nativeName: 'العربية', direction: 'rtl', isSystem: true } });
  await client.educationType.upsert({ where: { id: systemIds.educationType }, update: { isActive: true }, create: { id: systemIds.educationType, nameAr: 'تعليم عام', nameHe: 'חינוך כללי', isSystem: true } });
  await client.educationStage.upsert({ where: { id: systemIds.educationStage }, update: { isActive: true }, create: { id: systemIds.educationStage, nameAr: 'المرحلة المدرسية', nameHe: 'שלב בית הספר', isSystem: true } });
  await client.classType.upsert({ where: { id: systemIds.classType }, update: { isActive: true }, create: { id: systemIds.classType, nameAr: 'صف عادي', nameHe: 'כיתה רגילה', isSystem: true } });
  await client.compositionType.upsert({ where: { id: systemIds.compositionType }, update: { isActive: true }, create: { id: systemIds.compositionType, nameAr: 'مختلط', nameHe: 'מעורב', isSystem: true } });
  await client.gradeLevel.createMany({ data: gradeLevels, skipDuplicates: true });
  await client.gender.upsert({ where: { id: systemIds.genderUnknown }, update: { genderCode: 'u' }, create: { id: systemIds.genderUnknown, genderCode: 'u', nameAr: 'غير محدد', nameHe: 'לא מוגדר' } });
  await client.gender.upsert({ where: { id: systemIds.genderMale }, update: { genderCode: 'm' }, create: { id: systemIds.genderMale, genderCode: 'm', nameAr: 'ذكر', nameHe: 'זכר', sortOrder: 1 } });
  await client.gender.upsert({ where: { id: systemIds.genderFemale }, update: { genderCode: 'f' }, create: { id: systemIds.genderFemale, genderCode: 'f', nameAr: 'أنثى', nameHe: 'נקבה', sortOrder: 2 } });
  await client.studentStatus.upsert({ where: { id: systemIds.studentStatus }, update: {}, create: { id: systemIds.studentStatus, nameAr: 'نشط', nameHe: 'פעיל' } });
  await client.enrollmentStatus.upsert({ where: { id: systemIds.enrollmentStatus }, update: {}, create: { id: systemIds.enrollmentStatus, nameAr: 'مسجل', nameHe: 'רשום' } });
  await client.relationType.upsert({ where: { id: systemIds.relationType }, update: {}, create: { id: systemIds.relationType, nameAr: 'ولي أمر', nameHe: 'הורה' } });
  await client.studentFeature.upsert({ where: { id: systemIds.studentFeatureNormal }, update: { nameAr: 'عادي', nameHe: 'רגיל' }, create: { id: systemIds.studentFeatureNormal, nameAr: 'عادي', nameHe: 'רגיל' } });
  await client.studentFeature.upsert({ where: { id: systemIds.studentFeatureMerged }, update: { nameAr: 'دمج', nameHe: 'שילוב' }, create: { id: systemIds.studentFeatureMerged, nameAr: 'دمج', nameHe: 'שילוב' } });
  for (const [module, action, nameAr] of permissions) {
    await client.permission.upsert({ where: { module_action: { module, action } }, update: { nameAr, isActive: true }, create: { module, action, nameAr, nameHe: null, isActive: true } });
  }
}

export type PlatformBootstrapResult = 'SKIPPED' | 'CREATED' | 'EXISTS';

export async function bootstrapPlatformAdmin(client: PrismaClient): Promise<PlatformBootstrapResult> {
  const email = process.env['PLATFORM_ADMIN_EMAIL']?.trim().toLowerCase();
  const password = process.env['PLATFORM_ADMIN_PASSWORD'];
  if (!email && !password) return 'SKIPPED';
  if (!email || !password) throw new Error('PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD must be provided together.');
  const existing = await client.user.findUnique({ where: { normalizedEmail: email }, include: { institutionUser: true } });
  if (existing) {
    if (!existing.isPlatformAdmin || existing.institutionUser) throw new Error('The configured platform administrator email is already assigned to a school account.');
    return 'EXISTS';
  }
  await client.user.create({ data: { email, normalizedEmail: email, passwordHash: await hashPassword(password), isActive: true, isPlatformAdmin: true, mustChangePassword: false } });
  return 'CREATED';
}
