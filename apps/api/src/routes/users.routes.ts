import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission.middleware';
import * as controller from '../controllers/users.controller';
import { asyncHandler } from '../middleware/asyncHandler';
import { checkPlanLimit, requireActiveSubscription } from '../services/subscription.service';
import { setupTokenReissueRateLimiter } from '../middleware/rate-limiters.middleware';

const router = Router();
router.get('/permissions', requireAuth, requirePermission('settings', 'read'), asyncHandler(controller.getPermissions));
router.get('/roles', requireAuth, requirePermission('settings', 'read'), asyncHandler(controller.getRoles));
router.post('/roles', requireAuth, requirePermission('settings', 'create'), asyncHandler(controller.createRoles));
router.put('/roles/:id', requireAuth, requirePermission('settings', 'update'), asyncHandler(controller.updateRolesById));
router.delete('/roles/:id', requireAuth, requirePermission('settings', 'update'), asyncHandler(controller.deleteRolesById));
router.get('/staff-members/unregistered', requireAuth, requirePermission('teachers', 'read'), asyncHandler(controller.getStaffMembersUnregistered));
router.get('/institution-users', requireAuth, requirePermission('settings', 'read'), asyncHandler(controller.getInstitutionUsers));
router.post('/institution-users', requireAuth, requirePermission('settings', 'create'), requireActiveSubscription, checkPlanLimit('users'), asyncHandler(controller.createInstitutionUsers));
router.post('/institution-users/:id/account-setup/reissue', setupTokenReissueRateLimiter, requireAuth, requirePermission('settings', 'update'), asyncHandler(controller.reissueInstitutionUserSetup));
router.patch('/institution-users/:id', requireAuth, requirePermission('settings', 'update'), asyncHandler(controller.patchInstitutionUsersById));

export default router;
