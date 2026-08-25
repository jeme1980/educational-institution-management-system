import { ActionItem, ActionType } from '../models/action-center.model';

export function groupActionItems(items: ActionItem[]) { return { students: items.filter((item) => item.type === 'STUDENT_DECLINE'), classes: items.filter((item) => item.type === 'CLASS_DECLINE'), dimensions: items.filter((item) => item.type === 'DIMENSION_DECLINE'), interventions: items.filter((item) => item.type.startsWith('INTERVENTION_')) }; }
export function actionTypeLabel(type: ActionType): string { return ({ STUDENT_DECLINE: 'تراجع طالب', CLASS_DECLINE: 'تراجع شعبة', DIMENSION_DECLINE: 'تراجع مهارة أو موضوع', INTERVENTION_NO_FOLLOWUP: 'لا توجد متابعة', INTERVENTION_CRITERION_NOT_MET: 'معيار التدخل غير محقق', INTERVENTION_LOW_COVERAGE: 'تغطية متابعة منخفضة' } as Record<ActionType, string>)[type]; }
