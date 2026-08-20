import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as controller from '../controllers/auth.controller';
import { asyncHandler } from '../middleware/asyncHandler';
import { changePasswordRateLimiter, loginRateLimiter, refreshRateLimiter } from '../middleware/rate-limiters.middleware';

const router = Router();
router.post('/auth/login', loginRateLimiter, asyncHandler(controller.createAuthLogin));
router.post('/auth/refresh', refreshRateLimiter, asyncHandler(controller.refreshAuthSession));
router.post('/auth/logout', asyncHandler(controller.logoutAuthSession));
router.post('/auth/logout-all', requireAuth, asyncHandler(controller.logoutAllAuthSessions));
router.post('/auth/change-password', changePasswordRateLimiter, requireAuth, asyncHandler(controller.createAuthChangePassword));
router.get('/auth/me', requireAuth, asyncHandler(controller.getAuthMe));

export default router;
