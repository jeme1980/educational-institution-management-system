import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { completeAccountSetup } from '../controllers/account-setup.controller';
import { accountSetupRateLimiter } from '../middleware/rate-limiters.middleware';

const router = Router();
router.post('/account/setup', accountSetupRateLimiter, asyncHandler(completeAccountSetup));
export default router;
