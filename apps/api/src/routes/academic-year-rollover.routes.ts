import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission.middleware';
import { asyncHandler } from '../middleware/asyncHandler';
import { validateRequest } from '../middleware/validate';
import { academicYearRolloverPreviewSchema, academicYearRolloverDraftSchema, academicYearRolloverClassMappingPatchSchema, academicYearRolloverStudentDecisionPatchSchema, academicYearRolloverStudentDecisionBulkSchema } from '../validation/academic-year-rollover.schemas';
import { previewAcademicYearRolloverController, createAcademicYearRolloverDraftController, getAcademicYearRolloverDraftController, patchAcademicYearRolloverClassMappingController, patchAcademicYearRolloverStudentDecisionController, bulkPatchAcademicYearRolloverStudentDecisionsController } from '../controllers/academic-year-rollover.controller';

const router = Router();
router.post('/academic-years/rollover/preview', requireAuth, requirePermission('settings', 'read'), validateRequest(academicYearRolloverPreviewSchema), asyncHandler(previewAcademicYearRolloverController));
router.post('/academic-years/rollover', requireAuth, requirePermission('settings', 'update'), validateRequest(academicYearRolloverDraftSchema), asyncHandler(createAcademicYearRolloverDraftController));
router.get('/academic-years/rollover/:rolloverId', requireAuth, requirePermission('settings', 'read'), asyncHandler(getAcademicYearRolloverDraftController));
router.patch('/academic-years/rollover/:rolloverId/classes/:mappingId', requireAuth, requirePermission('settings', 'update'), validateRequest(academicYearRolloverClassMappingPatchSchema), asyncHandler(patchAcademicYearRolloverClassMappingController));
router.patch('/academic-years/rollover/:rolloverId/students/:decisionId', requireAuth, requirePermission('settings', 'update'), validateRequest(academicYearRolloverStudentDecisionPatchSchema), asyncHandler(patchAcademicYearRolloverStudentDecisionController));
router.patch('/academic-years/rollover/:rolloverId/students', requireAuth, requirePermission('settings', 'update'), validateRequest(academicYearRolloverStudentDecisionBulkSchema), asyncHandler(bulkPatchAcademicYearRolloverStudentDecisionsController));
export default router;
