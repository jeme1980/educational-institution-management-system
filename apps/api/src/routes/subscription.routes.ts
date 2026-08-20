import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission.middleware';
import { asyncHandler } from '../middleware/asyncHandler';
import * as controller from '../controllers/subscription.controller';

const router = Router();
router.get('/subscription', requireAuth, requirePermission('subscription', 'read'), asyncHandler(controller.getSubscription));

export default router;
