import { buildProgressTrackingPoints, ProgressTrackingPoint, buildStudentProgressPoints } from './progress-tracking.service';

export const ACTION_TYPES = ['CLASS_DECLINE', 'STUDENT_DECLINE', 'DIMENSION_DECLINE', 'INTERVENTION_NO_FOLLOWUP', 'INTERVENTION_CRITERION_NOT_MET', 'INTERVENTION_LOW_COVERAGE'] as const;
export type ActionType = typeof ACTION_TYPES[number];
export type ActionSeverity = 'high' | 'medium' | 'low';

export interface ActionItem {
  key: string;
  type: ActionType;
  severity: ActionSeverity;
  title: string;
  description: string;
  academicYear: { id: string; yearLabel: string };
  subject: { id: string; nameAr: string };
  studyGroup: { id: string; nameAr: string };
  metric: { previous: number | null; current: number | null; change: number | null; unit: string };
  target: { studentId?: string; interventionId?: string; dimensionId?: string; examId?: string };
  action: { label: string; route: string; queryParams?: Record<string, string> };
  source: string;
}

export interface InterventionSignal {
  id: string;
  title: string;
  targetedStudentCount: number;
  measuredStudentCount: number;
  baselineMastery: number | null;
  latestMastery: number | null;
  criterionMet: boolean | null;
  academicYear: ActionItem['academicYear'];
  subject: ActionItem['subject'];
  studyGroup: ActionItem['studyGroup'];
}

export interface ActionCenterInput {
  academicYear: ActionItem['academicYear'];
  subject: ActionItem['subject'];
  studyGroup: ActionItem['studyGroup'];
  classPoints: ProgressTrackingPoint[];
  studentPoints: Array<{ id: string; name: string; points: ReturnType<typeof buildStudentProgressPoints> }>;
  dimensions: Array<{ id: string; name: string; points: Array<{ status: string; masteryRate: number | null; examId: string }> }>;
  interventions: InterventionSignal[];
}

const changeOf = (previous: number | null, current: number | null) => previous !== null && current !== null ? Number((current - previous).toFixed(2)) : null;
const metric = (previous: number | null, current: number | null) => ({ previous, current, change: changeOf(previous, current), unit: 'percentagePoints' });
const severity: Record<ActionType, ActionSeverity> = { INTERVENTION_CRITERION_NOT_MET: 'high', INTERVENTION_NO_FOLLOWUP: 'high', STUDENT_DECLINE: 'medium', CLASS_DECLINE: 'medium', DIMENSION_DECLINE: 'medium', INTERVENTION_LOW_COVERAGE: 'low' };
const order: Record<ActionType, number> = { INTERVENTION_CRITERION_NOT_MET: 1, INTERVENTION_NO_FOLLOWUP: 2, STUDENT_DECLINE: 3, CLASS_DECLINE: 4, DIMENSION_DECLINE: 5, INTERVENTION_LOW_COVERAGE: 6 };

export function aggregateActionItems(input: ActionCenterInput): ActionItem[] {
  const items: ActionItem[] = [];
  const base = { academicYear: input.academicYear, subject: input.subject, studyGroup: input.studyGroup };
  const add = (item: Omit<ActionItem, 'severity'>) => items.push({ ...item, severity: severity[item.type] });
  const classMeasured = input.classPoints.filter((point) => point.averagePercentage !== null);
  if (classMeasured.length >= 2) {
    const first = classMeasured[0]; const latest = classMeasured[classMeasured.length - 1]; const m = metric(first.averagePercentage, latest.averagePercentage);
    if ((m.change ?? 0) < 0) add({ ...base, key: `CLASS_DECLINE:${input.studyGroup.id}:${input.subject.id}:${input.academicYear.id}`, type: 'CLASS_DECLINE', title: `انخفاض متوسط أداء الشعبة`, description: `انخفض متوسط الشعبة بين أول وآخر امتحان مؤهل.`, metric: m, target: { examId: latest.examId }, action: { label: 'فتح مسار الشعبة', route: '/progress-tracking', queryParams: { mode: 'class', academicYearId: input.academicYear.id, subjectId: input.subject.id, studyGroupId: input.studyGroup.id } }, source: 'progress-tracking.class' });
  }
  for (const student of input.studentPoints) {
    const measured = student.points.filter((point) => point.participationStatus === 'completed' && point.studentPercentage !== null);
    if (measured.length < 2) continue;
    const first = measured[0].studentPercentage; const latest = measured[measured.length - 1].studentPercentage; const m = metric(first, latest);
    if ((m.change ?? 0) < 0) add({ ...base, key: `STUDENT_DECLINE:${student.id}:${input.studyGroup.id}:${input.subject.id}`, type: 'STUDENT_DECLINE', title: `انخفاض أداء ${student.name}`, description: `انخفض أداء الطالب بين أول وآخر نتيجة مكتملة.`, metric: m, target: { studentId: student.id, examId: measured[measured.length - 1].examId }, action: { label: 'فتح مسار الطالب', route: '/progress-tracking', queryParams: { mode: 'student', academicYearId: input.academicYear.id, subjectId: input.subject.id, studyGroupId: input.studyGroup.id, studentId: student.id } }, source: 'progress-tracking.student' });
  }
  for (const dimension of input.dimensions) {
    const measured = dimension.points.filter((point) => point.status === 'measured' && point.masteryRate !== null);
    if (measured.length < 2) continue;
    const first = measured[0].masteryRate; const latest = measured[measured.length - 1].masteryRate; const m = metric(first, latest);
    if ((m.change ?? 0) < 0) add({ ...base, key: `DIMENSION_DECLINE:${dimension.id}:${input.studyGroup.id}:${input.subject.id}`, type: 'DIMENSION_DECLINE', title: `انخفاض إتقان ${dimension.name}`, description: `انخفض الإتقان بين أول وآخر قياس متاح.`, metric: m, target: { dimensionId: dimension.id, examId: measured[measured.length - 1].examId }, action: { label: 'فتح مسار المهارات والموضوعات', route: '/progress-tracking', queryParams: { mode: 'dimensions', academicYearId: input.academicYear.id, subjectId: input.subject.id, studyGroupId: input.studyGroup.id } }, source: 'progress-tracking.dimension' });
  }
  for (const intervention of input.interventions) {
    const coverage = intervention.targetedStudentCount ? intervention.measuredStudentCount / intervention.targetedStudentCount : 0;
    const common = { ...base, target: { interventionId: intervention.id }, action: { label: 'فتح خطة التدخل', route: `/interventions/${intervention.id}` }, source: 'intervention-tracking.outcomes' };
    if (intervention.criterionMet === false) add({ ...common, key: `INTERVENTION_CRITERION_NOT_MET:${intervention.id}`, type: 'INTERVENTION_CRITERION_NOT_MET', title: intervention.title, description: 'القياس المتاح لا يحقق معيار النجاح المحدد.', metric: metric(intervention.baselineMastery, intervention.latestMastery) });
    else if (intervention.latestMastery === null) add({ ...common, key: `INTERVENTION_NO_FOLLOWUP:${intervention.id}`, type: 'INTERVENTION_NO_FOLLOWUP', title: intervention.title, description: 'لا توجد متابعة مؤهلة بعد خط الأساس حتى الآن.', metric: metric(intervention.baselineMastery, null) });
    else if (coverage < 1) add({ ...common, key: `INTERVENTION_LOW_COVERAGE:${intervention.id}`, type: 'INTERVENTION_LOW_COVERAGE', title: intervention.title, description: 'المتابعة متاحة لكن تغطية الطلاب المستهدفين غير مكتملة.', metric: metric(intervention.baselineMastery, intervention.latestMastery) });
  }
  return items.sort((a, b) => order[a.type] - order[b.type] || a.key.localeCompare(b.key));
}
