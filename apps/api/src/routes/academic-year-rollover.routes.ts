import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission.middleware';
import { asyncHandler } from '../middleware/asyncHandler';
import { validateRequest } from '../middleware/validate';
import { academicYearRolloverPreviewSchema } from '../validation/academic-year-rollover.schemas';
import { previewAcademicYearRolloverController } from '../controllers/academic-year-rollover.controller';

const router = Router();
router.post('/academic-years/rollover/preview', requireAuth, requirePermission('settings', 'read'), validateRequest(academicYearRolloverPreviewSchema), asyncHandler(previewAcademicYearRolloverController));
export default router;
