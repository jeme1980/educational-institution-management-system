import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission.middleware';
import * as controller from '../controllers/classes.controller';
import { asyncHandler } from '../middleware/asyncHandler';
import { validateRequest } from '../middleware/validate';
import { classSchema, classUpdateSchema } from '../validation/class.schemas';

const router = Router();
router.get('/classes', requireAuth, requirePermission('settings', 'read'), asyncHandler(controller.getClasses));
router.post('/classes', requireAuth, requirePermission('settings', 'create'), validateRequest(classSchema), asyncHandler(controller.createClasses));
router.put('/classes/:id', requireAuth, requirePermission('settings', 'create'), validateRequest(classUpdateSchema), asyncHandler(controller.updateClassesById));
router.delete('/classes/:id', requireAuth, requirePermission('settings', 'create'), asyncHandler(controller.deleteClassesById));

export default router;
