import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission.middleware';
import * as controller from '../controllers/study-groups.controller';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();
router.get('/study-groups', requireAuth, requirePermission('settings', 'read'), asyncHandler(controller.getStudyGroups));
router.post('/study-groups', requireAuth, requirePermission('settings', 'create'), asyncHandler(controller.createStudyGroups));
router.put('/study-groups/:id', requireAuth, requirePermission('settings', 'create'), asyncHandler(controller.updateStudyGroupsById));
router.delete('/study-groups/:id', requireAuth, requirePermission('settings', 'create'), asyncHandler(controller.deleteStudyGroupsById));
router.patch('/study-groups/:id/restore', requireAuth, requirePermission('settings', 'create'), asyncHandler(controller.restoreStudyGroupsById));
router.get('/study-groups/:id/members', requireAuth, requirePermission('settings', 'read'), asyncHandler(controller.getStudyGroupsByIdMembers));
router.post('/study-groups/:id/members', requireAuth, requirePermission('settings', 'create'), asyncHandler(controller.createStudyGroupsByIdMembers));
router.delete('/study-groups/:id/members/:memberId', requireAuth, requirePermission('settings', 'create'), asyncHandler(controller.deleteStudyGroupsByIdMembersByMemberId));

export default router;
