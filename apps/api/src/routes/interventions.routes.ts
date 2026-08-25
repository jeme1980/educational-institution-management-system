import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission.middleware';
import { asyncHandler } from '../middleware/asyncHandler';
import * as controller from '../controllers/interventions.controller';

const router = Router();
router.get('/interventions', requireAuth, requirePermission('exams', 'read'), asyncHandler(controller.getInterventions));
router.post('/interventions', requireAuth, requirePermission('exams', 'create'), asyncHandler(controller.createIntervention));
router.get('/interventions/:id/outcomes', requireAuth, requirePermission('exams', 'read'), asyncHandler(controller.getInterventionOutcomes));
router.get('/interventions/:id', requireAuth, requirePermission('exams', 'read'), asyncHandler(controller.getInterventionById));
router.patch('/interventions/:id', requireAuth, requirePermission('exams', 'update'), asyncHandler(controller.updateIntervention));

export default router;
