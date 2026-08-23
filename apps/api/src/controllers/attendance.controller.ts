import { AttendanceStatus } from '@prisma/client';
import { Response } from 'express';
import { ContextRequest } from '../middleware/context';
import { prisma } from '../db/prisma';
import { recordAuditEvent } from '../services/audit.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = new Set(Object.values(AttendanceStatus));
const contextOf = (req: ContextRequest) => ({ institutionId: req.context?.institutionId || '', academicYearId: req.context?.academicYearId || '' });

function dateOf(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function targetId(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value : null;
}

const eligibleEnrollmentWhere = (institutionId: string, academicYearId: string) => ({
  institutionId,
  academicYearId,
  isActive: true,
  isDeleted: false,
  enrollmentStatus: { isActive: true, isFinalStatus: false },
  student: { isActive: true },
});

async function resolveTarget(req: ContextRequest, query: Record<string, unknown> = req.query as Record<string, unknown>) {
  const { institutionId, academicYearId } = contextOf(req);
  const classId = targetId(query.classId);
  const studyGroupId = targetId(query.studyGroupId);
  if ((classId ? 1 : 0) + (studyGroupId ? 1 : 0) !== 1) return null;
  if (classId) {
    const classRoom = await prisma.class.findFirst({ where: { id: classId, institutionId, academicYearId, archivedAt: null } });
    return classRoom ? { kind: 'class' as const, id: classRoom.id, classId: classRoom.id, groupId: null } : null;
  }
  const group = await prisma.studyGroup.findFirst({ where: { id: studyGroupId!, institutionId, academicYearId, archivedAt: null, isActive: true } });
  return group ? { kind: 'group' as const, id: group.id, classId: group.classId, groupId: group.id } : null;
}

function enrollmentWhere(target: { classId: string | null; groupId: string | null }, institutionId: string, academicYearId: string) {
  return {
    ...eligibleEnrollmentWhere(institutionId, academicYearId),
    ...(target.groupId
      ? { studyGroupStudents: { some: { institutionId, studyGroupId: target.groupId } } }
      : { classId: target.classId! }),
  };
}

function serialize(row: any) {
  return row ? { id: row.id, status: row.status, notes: row.notes, date: row.attendanceDate.toISOString().slice(0, 10) } : null;
}

export async function getAttendanceRoster(req: ContextRequest, res: Response): Promise<any> {
  const { institutionId, academicYearId } = contextOf(req);
  const date = dateOf(req.query.date);
  const target = await resolveTarget(req);
  if (!institutionId || !academicYearId || !date) return res.status(400).json({ error: 'A valid date and attendance target are required.' });
  if (!target) return res.status(404).json({ error: 'The selected class or study group is not available in the current context.' });
  const enrollments = await prisma.studentEnrollment.findMany({
    where: enrollmentWhere(target, institutionId, academicYearId),
    select: { id: true, classId: true, student: { select: { id: true, firstNameAr: true, lastNameAr: true, nationalId: true } } },
    orderBy: [{ student: { lastNameAr: 'asc' } }, { student: { firstNameAr: 'asc' } }],
  });
  const attendance = await prisma.attendance.findMany({ where: { institutionId, attendanceDate: date, studentEnrollmentId: { in: enrollments.map((item) => item.id) } } });
  const byEnrollment = new Map(attendance.map((row) => [row.studentEnrollmentId, serialize(row)]));
  return res.json({ target, date: req.query.date, students: enrollments.map((item) => ({ ...item.student, studentEnrollmentId: item.id, classId: item.classId, attendance: byEnrollment.get(item.id) || null })) });
}

export async function saveAttendanceBatch(req: ContextRequest, res: Response): Promise<any> {
  const { institutionId, academicYearId } = contextOf(req);
  const date = dateOf(req.body?.date);
  const classId = targetId(req.body?.classId);
  const studyGroupId = targetId(req.body?.studyGroupId);
  const records = Array.isArray(req.body?.records) ? req.body.records : [];
  if (!institutionId || !academicYearId || !date || (classId ? 1 : 0) + (studyGroupId ? 1 : 0) !== 1 || !records.length) return res.status(400).json({ error: 'A valid date, target, and attendance records are required.' });
  const target = await resolveTarget(req, classId ? { classId } : { studyGroupId });
  if (!target) return res.status(404).json({ error: 'The selected attendance target is not available in the current context.' });
  const ids = records.map((item: any) => targetId(item?.studentEnrollmentId));
  if (ids.some((id: string | null) => !id) || new Set(ids).size !== ids.length || records.some((item: any) => !statuses.has(item?.status))) return res.status(400).json({ error: 'Attendance records are invalid.' });
  const enrollments = await prisma.studentEnrollment.findMany({ where: { ...enrollmentWhere(target, institutionId, academicYearId), id: { in: ids as string[] } }, select: { id: true, studentId: true } });
  if (enrollments.length !== ids.length) return res.status(422).json({ error: 'One or more selected students are not eligible for this attendance target.' });
  const saved = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (const item of records) {
      const row = await tx.attendance.upsert({
        where: { institutionId_studentEnrollmentId_attendanceDate: { institutionId, studentEnrollmentId: item.studentEnrollmentId, attendanceDate: date } },
        create: { institutionId, studentEnrollmentId: item.studentEnrollmentId, attendanceDate: date, status: item.status as AttendanceStatus, notes: item.notes ?? null, createdBy: req.user?.uid ?? null },
        update: { status: item.status as AttendanceStatus, notes: item.notes ?? null, updatedBy: req.user?.uid ?? null },
      });
      rows.push(row);
    }
    await recordAuditEvent(tx, { institutionId, actorUserId: req.user?.uid, action: 'BATCH_UPDATE', entityType: 'Attendance', metadata: { date: req.body.date, targetType: target.kind, targetId: target.id, recordCount: rows.length } });
    return rows;
  });
  return res.json({ date: req.body.date, count: saved.length, records: saved.map(serialize) });
}
