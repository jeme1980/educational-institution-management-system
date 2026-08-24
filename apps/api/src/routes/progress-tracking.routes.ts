import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission.middleware';
import { asyncHandler } from '../middleware/asyncHandler';
import * as controller from '../controllers/progress-tracking.controller';

const router = Router();
router.get('/progress-tracking', requireAuth, requirePermission('exams', 'read'), asyncHandler(controller.getProgressTracking));
export default router;
