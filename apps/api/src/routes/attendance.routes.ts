import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission.middleware';
import { asyncHandler } from '../middleware/asyncHandler';
import * as controller from '../controllers/attendance.controller';

const router = Router();
router.get('/attendance/roster', requireAuth, requirePermission('attendance', 'read'), asyncHandler(controller.getAttendanceRoster));
router.post('/attendance/batch', requireAuth, requirePermission('attendance', 'update'), asyncHandler(controller.saveAttendanceBatch));
export default router;
