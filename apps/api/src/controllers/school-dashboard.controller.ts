import { Response } from 'express';
import { ContextRequest } from '../middleware/context';
import { getSchoolDashboard } from '../services/school-dashboard.service';

const uuid = (value: unknown): string | null => { const text = String(value || ''); return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null; };

export async function getSchoolDashboardController(req: ContextRequest, res: Response): Promise<any> {
  const institutionId = req.context?.institutionId || '';
  const requestedAcademicYearId = req.query.academicYearId;
  const academicYearId = uuid(requestedAcademicYearId) || req.context?.academicYearId || '';
  const parsedSubjectId = req.query.subjectId === undefined || req.query.subjectId === '' ? undefined : uuid(req.query.subjectId);
  const subjectId = parsedSubjectId || undefined;
  if (!institutionId || !uuid(academicYearId)) return res.status(400).json({ error: 'Academic year is required.' });
  if (req.query.subjectId !== undefined && req.query.subjectId !== '' && !subjectId) return res.status(400).json({ error: 'Subject is invalid.' });
  const result = await getSchoolDashboard(institutionId, academicYearId, subjectId);
  if (!result) return res.status(404).json({ error: 'The selected school dashboard context is not available.' });
  return res.json(result);
}
