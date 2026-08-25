import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission.middleware';
import { asyncHandler } from '../middleware/asyncHandler';
import { getActionCenter } from '../controllers/action-center.controller';

const router = Router();
router.get('/action-center', requireAuth, requirePermission('exams', 'read'), asyncHandler(getActionCenter));
export default router;
