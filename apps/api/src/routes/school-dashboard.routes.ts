import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission.middleware';
import { asyncHandler } from '../middleware/asyncHandler';
import { getSchoolDashboardController } from '../controllers/school-dashboard.controller';

const router = Router();
router.get('/school-dashboard', requireAuth, requirePermission('exams', 'read'), asyncHandler(getSchoolDashboardController));
export default router;
