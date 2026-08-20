import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission.middleware';
import { asyncHandler } from '../middleware/asyncHandler';
import * as controller from '../controllers/audit.controller';

const router = Router();
router.get('/audit-logs', requireAuth, requirePermission('audit', 'read'), asyncHandler(controller.getAuditLogs));
router.get('/audit-logs/:id', requireAuth, requirePermission('audit', 'read'), asyncHandler(controller.getAuditLogById));
export default router;
