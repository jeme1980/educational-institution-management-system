import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';

export type ParticipationStatus = 'all' | 'participated' | 'not_participated';

export interface StaffDevelopmentAnalysisFilters {
  specializationId?: string;
  staffMemberId?: string;
  providerId?: string;
  courseCode?: string;
  search?: string;
  startDate?: Date;
  endDate?: Date;
  participationStatus: ParticipationStatus;
}

export interface StaffAnalysisDevelopment {
  id: string;
  courseCode: string;
  courseName: string;
  hoursCount: number | null;
  startDate: Date;
  endDate: Date;
  provider: { id: string; name: string } | null;
}

export interface StaffAnalysisMember {
  id: string;
  firstNameAr: string;
  familyNameAr: string;
  archivedAt: Date | null;
  specialization: { id: string; nameAr: string } | null;
  developments: StaffAnalysisDevelopment[];
}

type Aggregate = { label: string; code?: string; hours: number; records: number; staff: number };

function aggregate(developments: Array<StaffAnalysisDevelopment & { staffMemberId: string }>, labelOf: (item: StaffAnalysisDevelopment) => string, codeOf?: (item: StaffAnalysisDevelopment) => string): Aggregate[] {
  const rows = new Map<string, Aggregate & { staffIds: Set<string> }>();
  for (const item of developments) {
    const label = labelOf(item); const key = codeOf?.(item) || label;
    const row = rows.get(key) || { label, code: codeOf?.(item), hours: 0, records: 0, staff: 0, staffIds: new Set<string>() };
    row.hours += item.hoursCount ?? 0; row.records += 1; row.staffIds.add(item.staffMemberId); row.staff = row.staffIds.size; rows.set(key, row);
  }
  return [...rows.values()].sort((left, right) => right.hours - left.hours || right.staff - left.staff).map(({ staffIds: _staffIds, ...row }) => row);
}

export function buildStaffDevelopmentAnalysis(staffMembers: StaffAnalysisMember[], participationStatus: ParticipationStatus, range: { startDate?: Date; endDate?: Date } = {}) {
  const activeStaff = staffMembers.filter((staff) => !staff.archivedAt).map((staff) => ({ ...staff, developments: staff.developments.filter((item) => (!range.endDate || item.startDate <= range.endDate) && (!range.startDate || item.endDate >= range.startDate)) }));
  const internalRows = activeStaff.map((staff) => {
    const latest = [...staff.developments].sort((left, right) => right.startDate.getTime() - left.startDate.getTime() || right.id.localeCompare(left.id))[0] || null;
    const developmentCount = staff.developments.length;
    return {
      staffId: staff.id,
      firstNameAr: staff.firstNameAr,
      familyNameAr: staff.familyNameAr,
      specialization: staff.specialization,
      participated: developmentCount > 0,
      developmentCount,
      totalHours: staff.developments.reduce((sum, item) => sum + (item.hoursCount ?? 0), 0),
      lastDevelopmentDate: latest?.startDate.toISOString() || null,
      lastDevelopmentName: latest?.courseName || null,
      lastProvider: latest?.provider?.name || null,
      developments: staff.developments,
    };
  });
  const participatingStaff = internalRows.filter((row) => row.participated).length;
  const nonParticipatingStaff = internalRows.length - participatingStaff;
  const visibleRows = internalRows.filter((row) => participationStatus === 'all' || (participationStatus === 'participated' ? row.participated : !row.participated));
  const visibleDevelopments = visibleRows.flatMap((row) => row.developments.map((item) => ({ ...item, staffMemberId: row.staffId })));
  const totalHours = visibleRows.reduce((sum, row) => sum + row.totalHours, 0);
  const visibleParticipants = visibleRows.filter((row) => row.participated).length;
  const providerIds = new Set(visibleRows.flatMap((row) => row.developments.map((item) => item.provider?.id).filter(Boolean)));
  const completionCodes = new Set(visibleRows.flatMap((row) => row.developments.map((item) => item.courseCode)));
  const specialtyRows = new Map<string, Aggregate & { staffIds: Set<string> }>();
  for (const row of visibleRows) {
    for (const item of row.developments) {
      const label = row.specialization?.nameAr || 'بدون تخصص'; const key = row.specialization?.id || 'none';
      const current = specialtyRows.get(key) || { label, hours: 0, records: 0, staff: 0, staffIds: new Set<string>() };
      current.hours += item.hoursCount ?? 0; current.records += 1; current.staffIds.add(row.staffId); current.staff = current.staffIds.size; specialtyRows.set(key, current);
    }
  }
  return {
    summary: {
      activeStaff: internalRows.length,
      participatingStaff,
      nonParticipatingStaff,
      totalRecords: visibleRows.reduce((sum, row) => sum + row.developmentCount, 0),
      totalHours,
      averageHours: visibleParticipants ? Number((totalHours / visibleParticipants).toFixed(1)) : 0,
      distinctProviders: providerIds.size,
      distinctCompletions: completionCodes.size,
    },
    rows: visibleRows.map(({ developments: _developments, ...row }) => row).sort((left, right) => Number(left.participated) - Number(right.participated) || `${left.firstNameAr} ${left.familyNameAr}`.localeCompare(`${right.firstNameAr} ${right.familyNameAr}`, 'ar')),
    aggregates: {
      specialties: [...specialtyRows.values()].sort((left, right) => right.hours - left.hours || right.staff - left.staff).map(({ staffIds: _staffIds, ...row }) => row),
      providers: aggregate(visibleDevelopments, (item) => item.provider?.name || 'بدون جهة مقدمة'),
      completions: aggregate(visibleDevelopments, (item) => item.courseName || item.courseCode, (item) => item.courseCode),
      yearly: aggregate(visibleDevelopments, (item) => String(item.startDate.getUTCFullYear())).sort((left, right) => Number(left.label) - Number(right.label)),
    },
  };
}

export function staffDevelopmentAnalysisWhere(institutionId: string, filters: StaffDevelopmentAnalysisFilters): { staffWhere: Prisma.StaffMemberWhereInput; developmentWhere: Prisma.StaffDevelopmentWhereInput } {
  const staffWhere: Prisma.StaffMemberWhereInput = {
    institutionId,
    archivedAt: null,
    ...(filters.specializationId ? { specializationId: filters.specializationId } : {}),
    ...(filters.staffMemberId ? { id: filters.staffMemberId } : {}),
    ...(filters.search ? { OR: [{ firstNameAr: { contains: filters.search, mode: 'insensitive' } }, { familyNameAr: { contains: filters.search, mode: 'insensitive' } }] } : {}),
  };
  const developmentWhere: Prisma.StaffDevelopmentWhereInput = {
    institutionId,
    ...(filters.providerId ? { providerId: filters.providerId } : {}),
    ...(filters.courseCode ? { courseCode: filters.courseCode } : {}),
    ...(filters.endDate ? { startDate: { lte: filters.endDate } } : {}),
    ...(filters.startDate ? { endDate: { gte: filters.startDate } } : {}),
  };
  return { staffWhere, developmentWhere };
}

export async function getStaffDevelopmentAnalysis(institutionId: string, filters: StaffDevelopmentAnalysisFilters) {
  const { staffWhere, developmentWhere } = staffDevelopmentAnalysisWhere(institutionId, filters);
  const [staffMembers, completionRows] = await Promise.all([
    prisma.staffMember.findMany({
      where: staffWhere,
      orderBy: [{ firstNameAr: 'asc' }, { familyNameAr: 'asc' }, { id: 'asc' }],
      select: {
        id: true, firstNameAr: true, familyNameAr: true, archivedAt: true,
        specialization: { select: { id: true, nameAr: true } },
        developments: {
          where: developmentWhere,
          orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
          select: { id: true, courseCode: true, courseName: true, hoursCount: true, startDate: true, endDate: true, provider: { select: { id: true, name: true } } },
        },
      },
    }),
    prisma.staffDevelopment.findMany({ where: { institutionId }, orderBy: [{ courseName: 'asc' }, { courseCode: 'asc' }], select: { courseCode: true, courseName: true } }),
  ]);
  const completionOptions = [...new Map(completionRows.map((item) => [item.courseCode, { code: item.courseCode, label: item.courseName }])).values()];
  return { ...buildStaffDevelopmentAnalysis(staffMembers, filters.participationStatus, filters), options: { completions: completionOptions } };
}
