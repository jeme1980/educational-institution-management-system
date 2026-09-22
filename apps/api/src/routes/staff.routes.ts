import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission.middleware';
import * as controller from '../controllers/staff.controller';
import { asyncHandler } from '../middleware/asyncHandler';
import { checkPlanLimit, requireActiveSubscription } from '../services/subscription.service';

const router = Router();
router.get('/staff', requireAuth, requirePermission('teachers', 'read'), asyncHandler(controller.getStaff));
router.post('/staff', requireAuth, requirePermission('teachers', 'create'), requireActiveSubscription, checkPlanLimit('staff'), asyncHandler(controller.createStaff));
router.put('/staff/:id', requireAuth, requirePermission('teachers', 'update'), asyncHandler(controller.updateStaffById));
router.delete('/staff/:id', requireAuth, requirePermission('teachers', 'delete'), asyncHandler(controller.deleteStaffById));
router.patch('/staff/:id/restore', requireAuth, requirePermission('teachers', 'update'), asyncHandler(controller.restoreStaffById));
router.get('/job-roles', requireAuth, requirePermission('teachers', 'read'), asyncHandler(controller.getJobRoles));
router.post('/job-roles', requireAuth, requirePermission('teachers', 'create'), asyncHandler(controller.createJobRoles));
router.put('/job-roles/:id', requireAuth, requirePermission('teachers', 'update'), asyncHandler(controller.updateJobRolesById));
router.delete('/job-roles/:id', requireAuth, requirePermission('teachers', 'delete'), asyncHandler(controller.deleteJobRolesById));
router.get('/staff-assignments', requireAuth, requirePermission('teachers', 'read'), asyncHandler(controller.getStaffAssignments));
router.post('/staff-assignments', requireAuth, requirePermission('teachers', 'create'), asyncHandler(controller.createStaffAssignments));
router.put('/staff-assignments/:id', requireAuth, requirePermission('teachers', 'update'), asyncHandler(controller.updateStaffAssignmentsById));
router.delete('/staff-assignments/:id', requireAuth, requirePermission('teachers', 'delete'), asyncHandler(controller.deleteStaffAssignmentsById));
router.get('/staff-development-analysis', requireAuth, requirePermission('teachers', 'read'), asyncHandler(controller.getStaffDevelopmentAnalysis));
router.get('/staff-developments', requireAuth, requirePermission('teachers', 'read'), asyncHandler(controller.getStaffDevelopments));
router.post('/staff-developments', requireAuth, requirePermission('teachers', 'create'), asyncHandler(controller.createStaffDevelopment));
router.put('/staff-developments/:id', requireAuth, requirePermission('teachers', 'update'), asyncHandler(controller.updateStaffDevelopment));
router.delete('/staff-developments/:id', requireAuth, requirePermission('teachers', 'delete'), asyncHandler(controller.deleteStaffDevelopment));

export default router;
