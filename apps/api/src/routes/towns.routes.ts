import { Router } from 'express';
import * as controller from '../controllers/towns.controller';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

router.get('/towns', asyncHandler(controller.getTowns));
router.get('/towns/:id', asyncHandler(controller.getTownById));

export default router;
