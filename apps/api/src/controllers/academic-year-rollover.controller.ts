import { Response } from 'express';
import { ContextRequest } from '../middleware/context';
import { previewAcademicYearRollover, RolloverPreviewError } from '../services/academic-year-rollover-preview.service';

export async function previewAcademicYearRolloverController(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = req.context?.institutionId || '';
  try {
    const result = await previewAcademicYearRollover(institutionId, req.body);
    return res.json(result);
  } catch (error) {
    if (error instanceof RolloverPreviewError) return res.status(error.status).json({ error: error.message, code: error.code });
    throw error;
  }
}
