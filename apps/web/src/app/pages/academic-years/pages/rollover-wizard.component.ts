import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import { UiSectionCardComponent } from '../../../shared/components/ui-section-card/ui-section-card.component';
import { ApiService } from '../../../core/services/api.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { ClassMapping, PreviewResult, RolloverAction, RolloverApiService, RolloverDraft, StudentDecision } from '../services/rollover-api.service';

@Component({ selector: 'app-rollover-wizard', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush, imports: [CommonModule, FormsModule, RouterLink, UiButtonComponent, UiPageHeaderComponent, UiSectionCardComponent], templateUrl: './rollover-wizard.component.html', styleUrl: './rollover-wizard.component.css' })
export class RolloverWizardComponent implements OnInit {
  readonly api = inject(ApiService); readonly rolloverApi = inject(RolloverApiService); readonly route = inject(ActivatedRoute); readonly router = inject(Router); readonly confirmDialog = inject(ConfirmDialogService);
  readonly step = signal(1); readonly sourceId = signal(''); readonly targetId = signal(''); readonly preview = signal<PreviewResult | null>(null); readonly draft = signal<RolloverDraft | null>(null); readonly loading = signal(false); readonly error = signal(''); readonly notice = signal(''); readonly search = signal(''); readonly gradeFilter = signal(''); readonly classFilter = signal(''); readonly actionFilter = signal(''); readonly statusFilter = signal(''); readonly selected = signal<Set<string>>(new Set());
  readonly years = computed(() => this.api.academicYears());
  readonly targets = computed(() => { const source = this.years().find(y => y.id === this.sourceId()); return this.years().filter(y => y.id !== this.sourceId() && !y.isClosed && !!source && new Date(y.startDate) > new Date(source.startDate)); });
  readonly filteredDecisions = computed(() => this.draft()?.studentDecisions.items.filter(item => {
    const query = this.search().trim();
    const name = `${item.sourceEnrollment.student?.firstNameAr || ''} ${item.sourceEnrollment.student?.lastNameAr || ''}`;
    return (!query || name.includes(query)) && (!this.gradeFilter() || item.sourceEnrollment.classRoom.gradeLevelId === this.gradeFilter()) && (!this.classFilter() || item.sourceEnrollment.classRoom.nameAr === this.classFilter()) && (!this.actionFilter() || item.action === this.actionFilter()) && (!this.statusFilter() || item.validationStatus === this.statusFilter());
  }) || []);
  readonly gradeOptions = computed(() => this.unique(this.draft()?.studentDecisions.items.map(row => ({ id: row.sourceEnrollment.classRoom.gradeLevelId, label: row.sourceEnrollment.classRoom.gradeLevel.nameAr })) || []));
  readonly classOptions = computed(() => [...new Set(this.draft()?.studentDecisions.items.map(row => row.sourceEnrollment.classRoom.nameAr) || [])]);
  async ngOnInit() { await this.api.loadAcademicYears(); const id = this.route.snapshot.paramMap.get('rolloverId'); if (id) await this.loadDraft(id); else { const current = this.years().find(y => y.isCurrent); this.sourceId.set(current?.id || ''); this.targetId.set(this.targets()[0]?.id || ''); } }
  async runPreview() { if (!this.sourceId() || !this.targetId()) return; this.loading.set(true); this.error.set(''); const result = await this.rolloverApi.preview(this.sourceId(), this.targetId()); this.loading.set(false); if (result.status === 200 && result.body) { this.preview.set(result.body); this.step.set(2); } else this.error.set('تعذر تحميل معاينة الترفيع.'); }
  async startDraft(): Promise<void> { const result = await this.rolloverApi.createDraft(this.sourceId(), this.targetId()); if (result.status === 201 && result.body?.operation.id) { await this.router.navigate(['/academic-years/rollover', result.body.operation.id]); return; } if (result.status === 409 && result.body?.existingRolloverId) { this.notice.set('يوجد إعداد محفوظ بالفعل لهذا الزوج، تم فتحه.'); await this.router.navigate(['/academic-years/rollover', result.body.existingRolloverId]); return; } this.error.set('تعذر بدء إعداد الترفيع.'); }
  async loadDraft(id: string) { this.loading.set(true); const result = await this.rolloverApi.getDraft(id); this.loading.set(false); if (result.status === 200 && result.body) { this.draft.set(result.body); this.sourceId.set(result.body.sourceYear.id); this.targetId.set(result.body.targetYear.id); this.step.set(2); } else this.error.set('تعذر فتح إعداد الترفيع.'); }
  actionLabel(action: string | null) { return ({ PROMOTE: 'ترفيع', REPEAT: 'إعادة', GRADUATE: 'متخرج', SKIP: 'عدم الترحيل', CREATE: 'إنشاء شعبة', USE_EXISTING: 'استخدام شعبة', null: 'غير محسوم' } as Record<string, string>)[String(action)] || 'غير محسوم'; }
  statusLabel(status: string) { return ({ VALID: 'جاهز', WARNING: 'تحذير', CONFLICT: 'تعارض', UNRESOLVED: 'غير محسوم' } as Record<string, string>)[status] || status; }
  blockerLabel(code: string) { return ({ MISSING_TARGET_PERIODS: 'السنة الهدف لا تحتوي فترات دراسية.', UNRESOLVED_STUDENT_DECISIONS: 'توجد قرارات طلاب غير محسومة.', CLASS_MAPPING_CONFLICTS: 'توجد شعب تحتاج مراجعة.' } as Record<string, string>)[code] || 'توجد متطلبات تحتاج مراجعة.'; }
  toggle(id: string, checked: boolean) { const next = new Set(this.selected()); if (checked) next.add(id); else next.delete(id); this.selected.set(next); }
  toggleFromEvent(id: string, event: Event) { this.toggle(id, (event.target as HTMLInputElement).checked); }
  toggleAll(event: Event) { const checked = (event.target as HTMLInputElement).checked; this.selected.set(checked ? new Set(this.filteredDecisions().map(row => row.id)) : new Set()); }
  async saveMapping(mapping: ClassMapping, actionValue: string, parallelValue: string) {
    const draft = this.draft(); if (!draft) return;
    if (!['CREATE', 'USE_EXISTING', 'SKIP'].includes(actionValue)) return;
    const action = actionValue as 'CREATE' | 'USE_EXISTING' | 'SKIP';
    const body = action === 'SKIP' ? { action } : action === 'USE_EXISTING' ? { action, targetClassId: mapping.targetClassId } : { action, targetStageId: mapping.targetStageId, targetGradeLevelId: mapping.targetGradeLevelId, targetParallelNumber: Number(parallelValue) };
    if (action === 'USE_EXISTING' && !mapping.targetClassId) { this.error.set('لا توجد شعبة هدف مرتبطة بهذا الصف لاستخدامها.'); return; }
    const result = await this.rolloverApi.patchMapping(draft.operation.id, mapping.id, body);
    if (result.status === 200) { this.notice.set('تم حفظ ربط الصف.'); await this.loadDraft(draft.operation.id); } else this.error.set('تعذر حفظ ربط الصف. راجع بيانات المرحلة والطبقة والشعبة.');
  }
  async changeDecision(item: StudentDecision, actionValue: string) {
    const draft = this.draft(); if (!draft) return;
    if (!['PROMOTE', 'REPEAT', 'GRADUATE', 'SKIP'].includes(actionValue)) return;
    const action = actionValue as Exclude<RolloverAction, null>;
    if ((action === 'GRADUATE' || action === 'SKIP') && !await this.confirmDialog.confirm({ title: 'تأكيد القرار', message: `سيتم تطبيق قرار ${this.actionLabel(action)} على الطالب المحدد.`, confirmText: 'تأكيد', variant: 'warning' })) return;
    const mapping = action === 'REPEAT' ? draft.classMappings.find(row => row.targetGradeLevelId === item.sourceEnrollment.classRoom.gradeLevelId && row.validationStatus === 'VALID') : item.targetClassMapping;
    if ((action === 'PROMOTE' || action === 'REPEAT') && !mapping?.targetGradeLevelId) { this.error.set('لا يوجد ربط صف صالح لهذا القرار. عدّل ربط الصفوف أولاً.'); return; }
    const body = action === 'PROMOTE' || action === 'REPEAT' ? { action, targetClassMappingId: mapping?.id, targetGradeLevelId: mapping?.targetGradeLevelId } : { action };
    const result = await this.rolloverApi.patchDecision(draft.operation.id, item.id, body);
    if (result.status === 200) { this.notice.set('تم حفظ قرار الطالب.'); await this.loadDraft(draft.operation.id); } else this.error.set('تعذر حفظ قرار الطالب.');
  }
  async bulk(action: 'PROMOTE' | 'REPEAT' | 'GRADUATE' | 'SKIP') {
    const draft = this.draft(); const ids = [...this.selected()]; if (!draft || !ids.length) return;
    if ((action === 'GRADUATE' || action === 'SKIP') && !await this.confirmDialog.confirm({ title: 'تأكيد التعديل الجماعي', message: `سيتم تطبيق قرار ${this.actionLabel(action)} على ${ids.length} طالبًا.`, confirmText: 'تأكيد', variant: 'warning' })) return;
    const rows = draft.studentDecisions.items.filter(row => ids.includes(row.id));
    const mappings = rows.map(row => action === 'REPEAT' ? draft.classMappings.find(mapping => mapping.targetGradeLevelId === row.sourceEnrollment.classRoom.gradeLevelId && mapping.validationStatus === 'VALID') : row.targetClassMapping);
    const mapping = mappings[0];
    if ((action === 'PROMOTE' || action === 'REPEAT') && (!mapping?.targetGradeLevelId || mappings.some(row => row?.id !== mapping.id))) { this.error.set('اختر طلابًا لهم ربط صف واحد صالح عند تطبيق الترفيع أو الإعادة جماعيًا.'); return; }
    const body = action === 'PROMOTE' || action === 'REPEAT' ? { action, targetClassMappingId: mapping?.id, targetGradeLevelId: mapping?.targetGradeLevelId } : { action };
    const result = await this.rolloverApi.patchDecisions(draft.operation.id, ids, body);
    if (result.status === 200) { this.selected.set(new Set()); this.notice.set(`تم تحديث ${ids.length} قرارًا.`); await this.loadDraft(draft.operation.id); } else this.error.set('تعذر تطبيق التعديل الجماعي.');
  }
  private unique(items: { id: string; label: string }[]) { return [...new Map(items.map(item => [item.id, item])).values()]; }
  track(_: number, item: { id: string }) { return item.id; }
}
