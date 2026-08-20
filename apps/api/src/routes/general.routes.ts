import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/permission.middleware';
import * as controller from '../controllers/general.controller';
import * as publicLookupsController from '../controllers/public-lookups.controller';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();
router.get('/lookups', asyncHandler(controller.getLookups));
router.get('/public-lookups', requireAuth, requirePermission('settings', 'read'), asyncHandler(publicLookupsController.getPublicLookups));
router.post('/public-lookups/:table', requireAuth, requirePermission('settings', 'create'), asyncHandler(publicLookupsController.createPublicLookup));
router.put('/public-lookups/:table/:id', requireAuth, requirePermission('settings', 'create'), asyncHandler(publicLookupsController.updatePublicLookup));
router.delete('/public-lookups/:table/:id', requireAuth, requirePermission('settings', 'create'), asyncHandler(publicLookupsController.deletePublicLookup));
router.get('/dashboard/stats', requireAuth, requirePermission('settings', 'read'), asyncHandler(controller.getDashboardStats));
export default router;
