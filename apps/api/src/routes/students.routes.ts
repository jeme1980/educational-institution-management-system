import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission.middleware';
import * as controller from '../controllers/students.controller';
import { asyncHandler } from '../middleware/asyncHandler';
import { validateRequest } from '../middleware/validate';
import {
  studentEnrollmentSchema,
  studentEnrollmentUpdateSchema,
  studentSchema,
  studentUpdateSchema,
  guardianCreateSchema,
  guardianUpdateSchema,
  medicalProfileSchema,
} from '../validation/student.schemas';
import { attendanceSchema, attendanceUpdateSchema } from '../validation/attendance.schemas';
import { checkPlanLimit, requireActiveSubscription } from '../services/subscription.service';

const router = Router();
router.get('/students', requireAuth, requirePermission('students', 'read'), asyncHandler(controller.getStudents));
router.get('/students/:id', requireAuth, requirePermission('students', 'read'), asyncHandler(controller.getStudentsById));
router.post('/students', requireAuth, requirePermission('students', 'create'), requireActiveSubscription, checkPlanLimit('students'), validateRequest(studentSchema), asyncHandler(controller.createStudents));
router.put('/students/:id', requireAuth, requirePermission('students', 'update'), validateRequest(studentUpdateSchema), asyncHandler(controller.updateStudentsById));
router.delete('/students/:id', requireAuth, requirePermission('students', 'delete'), asyncHandler(controller.deleteStudentsById));
router.patch('/students/:id/restore', requireAuth, requirePermission('students', 'update'), asyncHandler(controller.restoreStudentsById));
router.get('/students/:id/grades', requireAuth, requirePermission('students', 'read'), asyncHandler(controller.getStudentsByIdGrades));
router.get('/students/:id/guardians', requireAuth, requirePermission('guardian', 'read'), asyncHandler(controller.getStudentGuardians));
router.get('/relation-types', requireAuth, requirePermission('guardian', 'read'), asyncHandler(controller.getRelationTypes));
router.post('/students/:id/guardians', requireAuth, requirePermission('guardian', 'create'), validateRequest(guardianCreateSchema), asyncHandler(controller.createStudentGuardian));
router.get('/students/:id/medical-profile', requireAuth, requirePermission('medical-profile', 'read'), asyncHandler(controller.getStudentMedicalProfile));
router.put('/students/:id/medical-profile', requireAuth, requirePermission('medical-profile', 'update'), validateRequest(medicalProfileSchema), asyncHandler(controller.upsertStudentMedicalProfile));
router.patch('/students/:id/medical-profile', requireAuth, requirePermission('medical-profile', 'update'), validateRequest(medicalProfileSchema), asyncHandler(controller.upsertStudentMedicalProfile));
router.delete('/students/:id/medical-profile', requireAuth, requirePermission('medical-profile', 'update'), asyncHandler(controller.deleteStudentMedicalProfile));
router.put('/student-guardians/:id', requireAuth, requirePermission('guardian', 'update'), validateRequest(guardianUpdateSchema), asyncHandler(controller.updateStudentGuardian));
router.delete('/students/:studentId/guardians/:linkId', requireAuth, requirePermission('guardian', 'delete'), asyncHandler(controller.deleteStudentGuardian));
router.get('/students/:id/attendance', requireAuth, requirePermission('attendance', 'read'), asyncHandler(controller.getStudentsByIdAttendance));
router.post('/students/:id/attendance', requireAuth, requirePermission('attendance', 'create'), validateRequest(attendanceSchema), asyncHandler(controller.createStudentAttendance));
router.put('/attendance/:id', requireAuth, requirePermission('attendance', 'update'), validateRequest(attendanceUpdateSchema), asyncHandler(controller.updateStudentAttendance));
router.delete('/attendance/:id', requireAuth, requirePermission('attendance', 'delete'), asyncHandler(controller.deleteStudentAttendance));
router.get('/student-enrollments', requireAuth, requirePermission('students', 'read'), asyncHandler(controller.getStudentEnrollments));
router.post('/student-enrollments', requireAuth, requirePermission('students', 'create'), validateRequest(studentEnrollmentSchema), asyncHandler(controller.createStudentEnrollments));
router.put('/student-enrollments/:id', requireAuth, requirePermission('students', 'update'), validateRequest(studentEnrollmentUpdateSchema), asyncHandler(controller.updateStudentEnrollmentsById));
router.delete('/student-enrollments/:id', requireAuth, requirePermission('students', 'delete'), asyncHandler(controller.deleteStudentEnrollmentsById));

export default router;
