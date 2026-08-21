import { prisma } from './prisma';
import { ensureRolesAndPermissionsSeeded } from '../controllers/users.controller';
import { hashPassword } from '../security/password';
import { bootstrapSystemData, systemIds } from './system-bootstrap';

const ids = {
  institution: '00000000-0000-4000-8000-000000000001', academicYear: '00000000-0000-4000-8000-000000000007',
  staff: '00000000-0000-4000-8000-00000000000c', user: '00000000-0000-4000-8000-00000000000d',
  institutionUser: '00000000-0000-4000-8000-00000000000e', academicPeriodFirst: '00000000-0000-4000-8000-000000000013',
  academicPeriodSecond: '00000000-0000-4000-8000-000000000014', examTypeMonthly: '00000000-0000-4000-8000-000000000015',
  examTypeFinal: '00000000-0000-4000-8000-000000000016', questionTypeMcq: '00000000-0000-4000-8000-000000000017',
  questionTypeTrueFalse: '00000000-0000-4000-8000-000000000018', questionTypeEssay: '00000000-0000-4000-8000-000000000019',
  legacyPlan: '00000000-0000-4000-8000-000000000901',
} as const;

export async function seedDevelopmentDatabase(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') throw new Error('Development seed is disabled when NODE_ENV=production.');
  const adminEmail = (process.env['DEV_SEED_ADMIN_EMAIL'] || 'admin@school.edu').trim().toLowerCase();
  const adminPassword = process.env['DEV_SEED_ADMIN_PASSWORD'];
  if (!adminPassword) throw new Error('DEV_SEED_ADMIN_PASSWORD is required for the explicit development seed.');

  await bootstrapSystemData(prisma);
  const passwordHash = await hashPassword(adminPassword);
  await prisma.town.upsert({ where: { id: systemIds.town }, update: { regionId: systemIds.region }, create: { id: systemIds.town, nameAr: 'المدينة التعليمية', nameHe: 'העיר החינוכית', regionId: systemIds.region } });
  await prisma.institution.upsert({
    where: { id: ids.institution }, update: { email: adminEmail, archivedAt: null },
    create: { id: ids.institution, schoolCode: 'DEMO', slug: 'demo-school', nameAr: 'المؤسسة التعليمية التجريبية', nameHe: 'המוסד החינוכי לדוגמה', email: adminEmail, typeId: systemIds.educationType, regionId: systemIds.region, townId: systemIds.town, statusId: systemIds.status, defaultLanguageId: systemIds.language },
  });
  await prisma.plan.upsert({ where: { code: 'LEGACY' }, update: { nameAr: 'الخطة القديمة', isActive: true }, create: { id: ids.legacyPlan, code: 'LEGACY', nameAr: 'الخطة القديمة', descriptionAr: 'خطة توافقية غير محدودة للبيانات التجريبية.', isActive: true } });
  const existingSubscription = await prisma.institutionSubscription.findFirst({ where: { institutionId: ids.institution, status: 'ACTIVE' }, orderBy: { startsAt: 'desc' } });
  if (existingSubscription) await prisma.institutionSubscription.update({ where: { id: existingSubscription.id }, data: { planId: ids.legacyPlan, endsAt: null, trialEndsAt: null } });
  else await prisma.institutionSubscription.create({ data: { id: '00000000-0000-4000-8000-000000000902', institutionId: ids.institution, planId: ids.legacyPlan, status: 'ACTIVE', startsAt: new Date() } });

  await prisma.academicYear.upsert({ where: { id: ids.academicYear }, update: { isCurrent: true }, create: { id: ids.academicYear, institutionId: ids.institution, yearLabel: '2025-2026', startDate: new Date('2025-09-01'), endDate: new Date('2026-06-30'), isCurrent: true } });
  await prisma.academicPeriod.upsert({ where: { id: ids.academicPeriodFirst }, update: { nameAr: 'الفصل الأول', isActive: true, archivedAt: null }, create: { id: ids.academicPeriodFirst, institutionId: ids.institution, academicYearId: ids.academicYear, nameAr: 'الفصل الأول', nameHe: 'המחצית הראשונה', startDate: new Date('2025-09-01'), endDate: new Date('2026-01-31'), sortOrder: 1, isActive: true } });
  await prisma.academicPeriod.upsert({ where: { id: ids.academicPeriodSecond }, update: { nameAr: 'الفصل الثاني', isActive: true, archivedAt: null }, create: { id: ids.academicPeriodSecond, institutionId: ids.institution, academicYearId: ids.academicYear, nameAr: 'الفصل الثاني', nameHe: 'המחצית השנייה', startDate: new Date('2026-02-01'), endDate: new Date('2026-06-30'), sortOrder: 2, isActive: true } });
  await prisma.examType.upsert({ where: { id: ids.examTypeMonthly }, update: { isActive: true }, create: { id: ids.examTypeMonthly, institutionId: ids.institution, nameAr: 'اختبار شهري', nameHe: 'מבחן חודשי', isActive: true, sortOrder: 1 } });
  await prisma.examType.upsert({ where: { id: ids.examTypeFinal }, update: { isActive: true }, create: { id: ids.examTypeFinal, institutionId: ids.institution, nameAr: 'امتحان نهائي', nameHe: 'מבחן סופי', isActive: true, sortOrder: 2 } });
  for (const item of [
    { id: ids.questionTypeMcq, nameAr: 'اختيار من متعدد', nameHe: 'רב ברירה', sortOrder: 1 },
    { id: ids.questionTypeTrueFalse, nameAr: 'صح أو خطأ', nameHe: 'נכון או לא נכון', sortOrder: 2 },
    { id: ids.questionTypeEssay, nameAr: 'سؤال مقالي', nameHe: 'שאלה פתוחה', sortOrder: 3 },
  ]) {
    await prisma.questionType.upsert({ where: { id: item.id }, update: { nameAr: item.nameAr, nameHe: item.nameHe, isActive: true, sortOrder: item.sortOrder }, create: { ...item, institutionId: ids.institution, isActive: true } });
  }

  await prisma.staffMember.upsert({ where: { id: ids.staff }, update: { email: adminEmail, archivedAt: null }, create: { id: ids.staff, institutionId: ids.institution, firstNameAr: 'مدير', familyNameAr: 'النظام', email: adminEmail, genderId: systemIds.genderUnknown } });
  await prisma.user.upsert({ where: { id: ids.user }, update: { email: adminEmail, normalizedEmail: adminEmail, passwordHash, isActive: true, isPlatformAdmin: false }, create: { id: ids.user, email: adminEmail, normalizedEmail: adminEmail, passwordHash, isActive: true } });
  const institutionUser = await prisma.institutionUser.upsert({ where: { id: ids.institutionUser }, update: { isActive: true, archivedAt: null }, create: { id: ids.institutionUser, institutionId: ids.institution, userId: ids.user, staffMemberId: ids.staff, isActive: true } });
  await ensureRolesAndPermissionsSeeded(ids.institution);
  const adminRole = await prisma.role.findFirst({ where: { institutionId: ids.institution, isSystem: true, isActive: true, archivedAt: null } });
  if (adminRole) {
    const existingRole = await prisma.institutionUserRole.findFirst({ where: { institutionId: ids.institution, institutionUserId: institutionUser.id, roleId: adminRole.id } });
    if (!existingRole) await prisma.institutionUserRole.create({ data: { institutionId: ids.institution, institutionUserId: institutionUser.id, roleId: adminRole.id } });
  }
  await prisma.appState.upsert({ where: { institutionId: ids.institution }, update: {}, create: { institutionId: ids.institution, data: { registrationOpen: true, academicYearStatus: 'ACTIVE', systemMaintenance: false, theme: 'light' } } });
  console.log(`Development seed completed for ${adminEmail}.`);
}
