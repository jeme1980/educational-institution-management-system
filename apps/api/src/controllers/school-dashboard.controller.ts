import { Response } from 'express';
import { ContextRequest } from '../middleware/context';
import { getSchoolDashboard, SchoolDashboardFilterError } from '../services/school-dashboard.service';

const uuid = (value: unknown): string | null => { const text = String(value || ''); return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null; };

export async function getSchoolDashboardController(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = req.context?.institutionId || '';
  const list = (value: unknown): string[] => (Array.isArray(value) ? value : String(value || '').split(',')).map(String).map((item) => item.trim()).filter(Boolean);
  const academicYearIds = list(req.query.academicYearIds ?? req.query.academicYearId);
  const gradeLevelIds = list(req.query.gradeLevelIds);
  const classIds = list(req.query.classIds);
  const examTypeIds = list(req.query.examTypeIds);
  const subjectKey = req.query.subjectKey || req.query.subjectId ? String(req.query.subjectKey || req.query.subjectId) : undefined;
  const allIds = [...academicYearIds, ...gradeLevelIds, ...classIds, ...examTypeIds, ...(subjectKey ? [subjectKey] : [])];
  if (!institutionId || allIds.some((id) => !uuid(id))) return res.status(400).json({ error: 'One or more dashboard filters are invalid.' });
  try {
    return res.json(await getSchoolDashboard(institutionId, { academicYearIds, subjectKey, gradeLevelIds, classIds, examTypeIds }));
  } catch (error) {
    if (error instanceof SchoolDashboardFilterError) return res.status(error.status).json({ error: error.message });
    throw error;
  }
}
