import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission.middleware';
import * as controller from '../controllers/subjects.controller';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();
router.get('/topics', requireAuth, requirePermission('settings', 'read'), asyncHandler(controller.getTopics));
router.post('/topics', requireAuth, requirePermission('settings', 'create'), asyncHandler(controller.createTopics));
router.put('/topics/:id', requireAuth, requirePermission('settings', 'create'), asyncHandler(controller.updateTopicsById));
router.delete('/topics/:id', requireAuth, requirePermission('settings', 'create'), asyncHandler(controller.deleteTopicsById));
router.get('/skills', requireAuth, requirePermission('settings', 'read'), asyncHandler(controller.getSkills));
router.post('/skills', requireAuth, requirePermission('settings', 'create'), asyncHandler(controller.createSkills));
router.put('/skills/:id', requireAuth, requirePermission('settings', 'create'), asyncHandler(controller.updateSkillsById));
router.delete('/skills/:id', requireAuth, requirePermission('settings', 'create'), asyncHandler(controller.deleteSkillsById));
router.get('/subjects', requireAuth, requirePermission('settings', 'read'), asyncHandler(controller.getSubjects));
router.post('/subjects', requireAuth, requirePermission('settings', 'create'), asyncHandler(controller.createSubjects));
router.put('/subjects/:id', requireAuth, requirePermission('settings', 'create'), asyncHandler(controller.updateSubjectsById));
router.delete('/subjects/:id', requireAuth, requirePermission('settings', 'create'), asyncHandler(controller.deleteSubjectsById));

export default router;
