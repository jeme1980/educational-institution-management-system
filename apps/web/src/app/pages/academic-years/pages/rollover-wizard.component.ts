import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import { UiSectionCardComponent } from '../../../shared/components/ui-section-card/ui-section-card.component';
import { UiModalComponent } from '../../../shared/components/ui-modal/ui-modal.component';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { ClassMapping, PreviewResult, RolloverAction, RolloverApiError, RolloverApiService, RolloverDraft, RolloverExecuteResponse, RolloverExecuteResult, RolloverPolicy, StudentDecision } from '../services/rollover-api.service';

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
type BulkAction = Exclude<RolloverAction, null> | '';

@Component({
  selector: 'app-rollover-wizard', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatIconModule, RouterLink, UiButtonComponent, UiPageHeaderComponent, UiSectionCardComponent, UiModalComponent],
  templateUrl: './rollover-wizard.component.html', styleUrl: './rollover-wizard.component.css',
})
export class RolloverWizardComponent implements OnInit {
  readonly api = inject(ApiService);
  readonly rolloverApi = inject(RolloverApiService);
  readonly route = inject(ActivatedRoute);
  readonly router = inject(Router);
  readonly confirmDialog = inject(ConfirmDialogService);
  readonly step = signal(1);
  readonly sourceId = signal('');
  readonly targetId = signal('');
  readonly preview = signal<PreviewResult | null>(null);
  readonly draft = signal<RolloverDraft | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly search = signal('');
  readonly gradeFilter = signal('');
  readonly classFilter = signal('');
  readonly actionFilter = signal('');
  readonly statusFilter = signal('');
  readonly bulkAction = signal<BulkAction>('');
  readonly selected = signal<Set<string>>(new Set());
  readonly mappingSaveStates = signal<Record<string, SaveState>>({});
  readonly editingMapping = signal<ClassMapping | null>(null);
  readonly mappingAction = signal<'CREATE' | 'USE_EXISTING' | 'SKIP'>('CREATE');
  readonly mappingParallel = signal<number | null>(null);
  readonly mappingNameAr = signal('');
  readonly mappingNameHe = signal('');
  readonly executeConfirmationOpen = signal(false);
  readonly executeConfirmation = signal('');
  readonly executing = signal(false);
  readonly executeResult = signal<RolloverExecuteResult | null>(null);
  readonly executePolicy = signal<RolloverPolicy | null>(null);
  readonly executionNeedsRefresh = signal(false);
  readonly closingSourceYear = signal(false);
  readonly settingTargetCurrent = signal(false);
  readonly transitionError = signal('');
  readonly executeAvailable = computed(() => this.step() === 5 && this.draft()?.operation.status === 'DRAFT' && this.draft()?.readiness.canExecute === true && /^[a-f0-9]{64}$/i.test(this.draft()?.executionPlanFingerprint || ''));
  readonly completed = computed(() => this.draft()?.operation.status === 'COMPLETED' || !!this.executeResult());
  readonly canCloseSource = computed(() => { const year = this.draft()?.sourceYear; return this.completed() && !!year && !year.isClosed && !year.isCurrent && !year.archivedAt; });
  readonly canSetTargetCurrent = computed(() => { const year = this.draft()?.targetYear; return this.completed() && !!year && !year.isClosed && !year.isCurrent && !year.archivedAt; });
  private noticeTimer?: ReturnType<typeof setTimeout>;

  readonly years = computed(() => this.api.academicYears());
  readonly targets = computed(() => { const source = this.years().find(year => year.id === this.sourceId()); return this.years().filter(year => year.id !== this.sourceId() && !year.isClosed && !!source && new Date(year.startDate) > new Date(source.startDate)); });
  readonly classSummary = computed(() => { const rows = this.draft()?.classMappings || []; return { total: rows.length, ready: rows.filter(row => row.validationStatus === 'VALID').length, review: rows.filter(row => row.validationStatus !== 'VALID').length }; });
  readonly filteredDecisions = computed(() => this.draft()?.studentDecisions.items.filter(item => {
    const query = this.search().trim();
    const name = `${item.sourceEnrollment.student?.firstNameAr || ''} ${item.sourceEnrollment.student?.lastNameAr || ''}`;
    return (!query || name.includes(query)) && (!this.gradeFilter() || item.sourceEnrollment.classRoom.gradeLevelId === this.gradeFilter()) && (!this.classFilter() || item.sourceEnrollment.classRoom.nameAr === this.classFilter()) && (!this.actionFilter() || item.action === this.actionFilter()) && (!this.statusFilter() || item.validationStatus === this.statusFilter());
  }) || []);
  readonly gradeOptions = computed(() => this.unique(this.draft()?.studentDecisions.items.map(row => ({ id: row.sourceEnrollment.classRoom.gradeLevelId, label: row.sourceEnrollment.classRoom.gradeLevel.nameAr })) || []));
  readonly classOptions = computed(() => [...new Set(this.draft()?.studentDecisions.items.map(row => row.sourceEnrollment.classRoom.nameAr) || [])]);

  async ngOnInit() {
    await this.api.loadAcademicYears();
    const id = this.route.snapshot.paramMap.get('rolloverId');
    if (id) { await this.loadDraft(id); if (this.route.snapshot.queryParamMap.get('resumed') === '1') this.showNotice('يوجد إعداد ترفيع محفوظ بالفعل لهذا الزوج، تم فتحه.'); }
    else { const current = this.years().find(year => year.isCurrent); this.sourceId.set(current?.id || ''); this.targetId.set(this.targets()[0]?.id || ''); }
  }

  goToStep(step: number) { this.notice.set(''); this.step.set(step); }
  canGoNext() { return this.step() < 5; }
  showUnresolved() { this.statusFilter.set('UNRESOLVED'); this.goToStep(4); }
  reviewClasses() { this.goToStep(2); }
  async openTargetPeriods() { await this.router.navigate(['/academic-years'], { queryParams: { academicYearId: this.targetId() } }); }

  async runPreview() {
    if (!this.sourceId() || !this.targetId()) return;
    this.loading.set(true); this.error.set('');
    const result = await this.rolloverApi.preview(this.sourceId(), this.targetId());
    this.loading.set(false);
    if (result.status === 200 && result.body) { this.preview.set(result.body); this.goToStep(2); }
    else this.error.set('تعذر تحميل معاينة الترفيع.');
  }

  async startDraft(): Promise<void> {
    this.loading.set(true); this.error.set(''); this.notice.set('');
    try {
      const result = await this.rolloverApi.createDraft(this.sourceId(), this.targetId());
      if (result.status === 201 && result.body?.operation?.id) { await this.router.navigate(['/academic-years/rollover', result.body.operation.id]); return; }
      if (result.status === 409 && result.body?.code === 'ACTIVE_DRAFT_EXISTS' && result.body.existingRolloverId) {
        await this.loadDraft(result.body.existingRolloverId);
        this.showNotice('يوجد إعداد ترفيع محفوظ بالفعل لهذا الزوج، تم فتحه.');
        await this.router.navigate(['/academic-years/rollover', result.body.existingRolloverId], { queryParams: { resumed: '1' } });
        return;
      }
      this.error.set('تعذر بدء إعداد الترفيع.');
    } catch { this.error.set('تعذر بدء إعداد الترفيع.'); }
    finally { this.loading.set(false); }
  }

  async loadDraft(id: string) {
    this.loading.set(true);
    const result = await this.rolloverApi.getDraft(id);
    this.loading.set(false);
    if (result.status === 200 && result.body) { this.draft.set(result.body); this.sourceId.set(result.body.sourceYear.id); this.targetId.set(result.body.targetYear.id); if (result.body.operation.status === 'COMPLETED') { this.executeResult.set(result.body.operation.summary?.result || null); this.executePolicy.set(result.body.operation.summary?.policy || null); this.step.set(5); } else if (this.step() === 1) this.step.set(2); }
    else this.error.set('تعذر فتح إعداد الترفيع.');
  }

  actionLabel(action: string | null) { return ({ PROMOTE: 'ترفيع', REPEAT: 'إعادة في نفس الطبقة', GRADUATE: 'متخرج', SKIP: 'عدم الترحيل', CREATE: 'إنشاء شعبة', USE_EXISTING: 'استخدام شعبة موجودة', null: 'غير محسوم' } as Record<string, string>)[String(action)] || 'غير محسوم'; }
  statusLabel(status: string) { return ({ VALID: 'جاهز', WARNING: 'تحذير', CONFLICT: 'تعارض', UNRESOLVED: 'غير محسوم' } as Record<string, string>)[status] || status; }
  classStatusLabel(mapping: ClassMapping) { const state = this.mappingSaveStates()[mapping.id]; if (state === 'dirty') return 'غير محفوظ'; if (state === 'saving') return 'جارٍ الحفظ'; if (state === 'saved') return 'تم الحفظ'; if (state === 'error') return 'تعذر الحفظ'; if (mapping.action === 'SKIP') return 'يحتاج معالجة الطلاب'; return this.statusLabel(mapping.validationStatus); }
  statusTone(status: string) { return status === 'VALID' || status === 'saved' ? 'success' : status === 'WARNING' || status === 'dirty' || status === 'saving' ? 'warning' : 'danger'; }
  targetClassLabel(item: StudentDecision) { if (item.action === 'GRADUATE' || item.action === 'SKIP' || !item.targetClassMapping) return 'غير مطلوب'; return item.targetClassMapping.targetParallelNumber ? `شعبة ${item.targetClassMapping.targetParallelNumber}` : 'شعبة مقترحة'; }
  blockerTitle(code: string) { return ({ MISSING_TARGET_PERIODS: 'السنة الهدف لا تحتوي فترات دراسية', UNRESOLVED_STUDENT_DECISIONS: 'توجد قرارات طلاب غير محسومة', CLASS_MAPPING_CONFLICTS: 'توجد شعب تحتاج مراجعة' } as Record<string, string>)[code] || 'يوجد متطلب يحتاج مراجعة'; }
  blockerDescription(code: string) { return ({ MISSING_TARGET_PERIODS: 'أضف الفترات الدراسية للسنة الهدف قبل اكتمال الجاهزية.', UNRESOLVED_STUDENT_DECISIONS: `${this.draft()?.studentDecisions.summary['unresolved'] || 0} طالبًا يحتاجون قرارًا صالحًا.`, CLASS_MAPPING_CONFLICTS: `${this.classSummary().review} من ربطات الصفوف غير جاهزة.` } as Record<string, string>)[code] || 'راجع إعداد الترفيع لمعالجة هذا المتطلب.'; }
  blockerAction(code: string) { if (code === 'UNRESOLVED_STUDENT_DECISIONS') this.showUnresolved(); else if (code === 'CLASS_MAPPING_CONFLICTS') this.reviewClasses(); else if (code === 'MISSING_TARGET_PERIODS') void this.openTargetPeriods(); }
  blockerActionLabel(code: string) { return ({ MISSING_TARGET_PERIODS: 'إعداد الفترات الدراسية', UNRESOLVED_STUDENT_DECISIONS: 'مراجعة الطلاب', CLASS_MAPPING_CONFLICTS: 'مراجعة الصفوف والشعب' } as Record<string, string>)[code] || ''; }

  openExecuteConfirmation() { if (!this.executeAvailable()) return; this.executeConfirmation.set(''); this.executionNeedsRefresh.set(false); this.executeConfirmationOpen.set(true); }
  closeExecuteConfirmation() { if (!this.executing()) { this.executeConfirmationOpen.set(false); this.executeConfirmation.set(''); } }
  confirmationMatches() { return this.executeConfirmation().trim() === this.draft()?.targetYear.yearLabel; }
  async refreshExecutionStatus() { const id = this.draft()?.operation.id; if (!id || this.executing()) return; this.executionNeedsRefresh.set(false); await this.loadDraft(id); }
  async executeRollover() {
    const draft = this.draft();
    if (!draft || !this.executeAvailable() || !this.confirmationMatches() || this.executing() || !draft.executionPlanFingerprint) return;
    this.executing.set(true); this.error.set(''); this.executionNeedsRefresh.set(false);
    try {
      const response = await this.rolloverApi.executeAcademicYearRollover(draft.operation.id, draft.executionPlanFingerprint);
      const body = response.body;
      if (response.status === 200 && body && 'status' in body && body.status === 'COMPLETED') {
        const completed = body as RolloverExecuteResponse;
        this.executeResult.set(completed.result); this.executePolicy.set(completed.policy); this.executeConfirmationOpen.set(false); this.executeConfirmation.set('');
        this.draft.update(current => current ? { ...current, operation: { ...current.operation, status: 'COMPLETED', summary: { result: completed.result, policy: completed.policy } }, readiness: { ...current.readiness, canExecute: false } } : current);
        this.showNotice(completed.alreadyCompleted ? 'تم تنفيذ هذه العملية مسبقًا.' : 'تم تنفيذ ترفيع السنة بنجاح.');
        return;
      }
      const apiError = body as RolloverApiError | null;
      if (apiError?.code === 'ROLLOVER_PLAN_CHANGED') { this.executeConfirmationOpen.set(false); this.executeConfirmation.set(''); this.error.set('تغيرت بيانات إعداد الترفيع منذ آخر مراجعة. أعد مراجعة الخطة قبل التنفيذ.'); await this.loadDraft(draft.operation.id); }
      else if (apiError?.code === 'ROLLOVER_NOT_READY') { this.executeConfirmationOpen.set(false); this.executeConfirmation.set(''); this.error.set('لم يعد الترفيع جاهزًا للتنفيذ.'); await this.loadDraft(draft.operation.id); }
      else if (apiError?.code === 'ROLLOVER_EXECUTION_IN_PROGRESS') { this.executeConfirmationOpen.set(false); this.error.set('تنفيذ الترفيع جارٍ بالفعل.'); this.executionNeedsRefresh.set(true); }
      else { this.executeConfirmationOpen.set(false); this.error.set('تعذر تأكيد نتيجة تنفيذ الترفيع. حدّث حالة العملية قبل إعادة المحاولة.'); this.executionNeedsRefresh.set(true); }
    } catch { this.executeConfirmationOpen.set(false); this.error.set('تعذر تأكيد نتيجة تنفيذ الترفيع. حدّث حالة العملية قبل إعادة المحاولة.'); this.executionNeedsRefresh.set(true); }
    finally { this.executing.set(false); }
  }

  yearState(year: RolloverDraft['sourceYear'], target = false) { if (year.isClosed) return 'مغلقة'; if (year.isCurrent) return 'السنة الحالية'; return target ? 'غير حالية' : 'مفتوحة'; }
  yearStateTone(year: RolloverDraft['sourceYear']) { return year.isClosed ? 'neutral' : year.isCurrent ? 'success' : 'warning'; }
  async makeTargetCurrent() {
    const draft = this.draft();
    if (!draft || !this.canSetTargetCurrent() || this.settingTargetCurrent()) return;
    if (!await this.confirmDialog.confirm({ title: `جعل ${draft.targetYear.yearLabel} السنة الدراسية الحالية؟`, message: 'ستصبح هذه السنة الافتراضية في النظام، ولن تبقى السنة الحالية السابقة محددة كسنة حالية. لن يتم حذف بيانات أي سنة.', confirmText: 'جعلها السنة الحالية', variant: 'default' })) return;
    this.settingTargetCurrent.set(true); this.transitionError.set('');
    try {
      const result = await this.api.setCurrentAcademicYear(draft.targetYear.id);
      if (result.success) { await this.refreshTransitionYears(); this.showNotice('تم تغيير السنة الدراسية الحالية.'); }
      else this.transitionError.set(result.error || 'تعذر جعل السنة الهدف هي السنة الحالية.');
    } finally { this.settingTargetCurrent.set(false); }
  }
  async closeSourceYear() {
    const draft = this.draft();
    if (!draft || !this.canCloseSource() || this.closingSourceYear()) return;
    if (!await this.confirmDialog.confirm({ title: `إغلاق السنة الدراسية ${draft.sourceYear.yearLabel}`, message: 'سيتم إغلاق السنة الدراسية ولن يتم حذف بياناتها أو أرشفتها.', confirmText: 'إغلاق السنة', variant: 'warning' })) return;
    this.closingSourceYear.set(true); this.transitionError.set('');
    try {
      const result = await this.api.closeAcademicYear(draft.sourceYear.id);
      if (result.success) { await this.refreshTransitionYears(); this.showNotice(result.data.alreadyClosed ? 'السنة مغلقة بالفعل.' : 'تم إغلاق السنة الدراسية.'); }
      else this.transitionError.set(result.code === 'ACADEMIC_YEAR_IS_CURRENT' ? 'لا يمكن إغلاق السنة الحالية. عيّن سنة أخرى كسنة حالية أولًا.' : result.code === 'ACADEMIC_YEAR_ARCHIVED' ? 'لا يمكن إغلاق سنة مؤرشفة.' : (result.error || 'تعذر إغلاق السنة المصدر.'));
    } finally { this.closingSourceYear.set(false); }
  }
  private async refreshTransitionYears() {
    await this.api.loadAcademicYears();
    this.draft.update(current => {
      if (!current) return current;
      const source = this.api.academicYears().find(year => year.id === current.sourceYear.id);
      const target = this.api.academicYears().find(year => year.id === current.targetYear.id);
      return { ...current, sourceYear: source ? { ...current.sourceYear, ...source } : current.sourceYear, targetYear: target ? { ...current.targetYear, ...target } : current.targetYear };
    });
  }

  markMappingDirty(id: string) { if (this.completed()) return; this.setMappingState(id, 'dirty'); }
  openMappingEditor(mapping: ClassMapping) {
    if (this.completed()) return;
    this.editingMapping.set(mapping);
    this.mappingAction.set(mapping.action);
    this.mappingParallel.set(mapping.targetParallelNumber || null);
    this.mappingNameAr.set(mapping.targetNameAr || '');
    this.mappingNameHe.set(mapping.targetNameHe || '');
  }
  closeMappingEditor() { this.editingMapping.set(null); }
  async saveMappingEditor() {
    const mapping = this.editingMapping();
    if (!mapping) return;
    await this.saveMapping(mapping, this.mappingAction(), String(this.mappingParallel() || ''), this.mappingNameAr(), this.mappingNameHe());
    if (!['error', 'dirty'].includes(this.mappingSaveStates()[mapping.id] || '')) this.closeMappingEditor();
  }
  async saveMapping(mapping: ClassMapping, actionValue: string, parallelValue: string, targetNameAr = '', targetNameHe = '') {
    const draft = this.draft(); if (!draft || this.completed() || !['CREATE', 'USE_EXISTING', 'SKIP'].includes(actionValue)) return;
    const action = actionValue as 'CREATE' | 'USE_EXISTING' | 'SKIP';
    const body = action === 'SKIP' ? { action } : action === 'USE_EXISTING' ? { action, targetClassId: mapping.targetClassId } : { action, targetStageId: mapping.targetStageId, targetGradeLevelId: mapping.targetGradeLevelId, targetParallelNumber: Number(parallelValue), targetNameAr: targetNameAr.trim(), targetNameHe: targetNameHe.trim() || null };
    if (action === 'USE_EXISTING' && !mapping.targetClassId) { this.setMappingState(mapping.id, 'error'); this.error.set('اختر شعبة هدف موجودة قبل الحفظ.'); return; }
    if (action === 'CREATE' && (!mapping.targetStageId || !mapping.targetGradeLevelId || !Number(parallelValue) || !targetNameAr.trim())) { this.setMappingState(mapping.id, 'dirty'); return; }
    this.setMappingState(mapping.id, 'saving');
    const result = await this.rolloverApi.patchMapping(draft.operation.id, mapping.id, body);
    if (result.status === 200) { await this.loadDraft(draft.operation.id); this.setMappingState(mapping.id, 'saved'); setTimeout(() => this.setMappingState(mapping.id, 'idle'), 2200); }
    else { this.setMappingState(mapping.id, 'error'); this.error.set('تعذر حفظ ربط الصف. راجع بيانات المرحلة والطبقة والشعبة.'); }
  }

  toggle(id: string, checked: boolean) { if (this.completed()) return; const next = new Set(this.selected()); if (checked) next.add(id); else next.delete(id); this.selected.set(next); }
  toggleFromEvent(id: string, event: Event) { this.toggle(id, (event.target as HTMLInputElement).checked); }
  toggleAll(event: Event) { if (this.completed()) return; const checked = (event.target as HTMLInputElement).checked; this.selected.set(checked ? new Set(this.filteredDecisions().map(row => row.id)) : new Set()); }
  clearSelection() { this.selected.set(new Set()); this.bulkAction.set(''); }

  async changeDecision(item: StudentDecision, actionValue: string) {
    const draft = this.draft(); if (!draft || this.completed() || !['PROMOTE', 'REPEAT', 'GRADUATE', 'SKIP'].includes(actionValue)) return;
    const action = actionValue as Exclude<RolloverAction, null>;
    if ((action === 'GRADUATE' || action === 'SKIP') && !await this.confirmDialog.confirm({ title: 'تأكيد القرار', message: `سيتم تطبيق قرار ${this.actionLabel(action)} على الطالب المحدد.`, confirmText: 'تأكيد', variant: 'warning' })) return;
    const mapping = action === 'REPEAT' ? draft.classMappings.find(row => row.targetGradeLevelId === item.sourceEnrollment.classRoom.gradeLevelId && row.validationStatus === 'VALID') : item.targetClassMapping;
    if ((action === 'PROMOTE' || action === 'REPEAT') && !mapping?.targetGradeLevelId) { this.error.set('لا يوجد ربط صف صالح لهذا القرار. عدّل ربط الصفوف أولًا.'); return; }
    const body = action === 'PROMOTE' || action === 'REPEAT' ? { action, targetClassMappingId: mapping?.id, targetGradeLevelId: mapping?.targetGradeLevelId } : { action };
    const result = await this.rolloverApi.patchDecision(draft.operation.id, item.id, body);
    if (result.status === 200) { await this.loadDraft(draft.operation.id); this.showNotice('تم حفظ قرار الطالب.'); } else this.error.set('تعذر حفظ قرار الطالب.');
  }

  async applyBulk() { if (this.bulkAction()) await this.bulk(this.bulkAction() as Exclude<BulkAction, ''>); }
  async bulk(action: Exclude<BulkAction, ''>) {
    const draft = this.draft(); const ids = [...this.selected()]; if (!draft || this.completed() || !ids.length) return;
    const needsConfirm = action === 'GRADUATE' || action === 'SKIP' || (action === 'REPEAT' && ids.length >= 20);
    if (needsConfirm && !await this.confirmDialog.confirm({ title: 'تأكيد التعديل الجماعي', message: `سيتم تطبيق قرار ${this.actionLabel(action)} على ${ids.length} طالبًا.`, confirmText: 'تأكيد', variant: 'warning' })) return;
    const rows = draft.studentDecisions.items.filter(row => ids.includes(row.id));
    const mappings = rows.map(row => action === 'REPEAT' ? draft.classMappings.find(mapping => mapping.targetGradeLevelId === row.sourceEnrollment.classRoom.gradeLevelId && mapping.validationStatus === 'VALID') : row.targetClassMapping);
    const mapping = mappings[0];
    if ((action === 'PROMOTE' || action === 'REPEAT') && (!mapping?.targetGradeLevelId || mappings.some(row => row?.id !== mapping.id))) { this.error.set('اختر طلابًا لهم ربط صف واحد صالح عند تطبيق الترفيع أو الإعادة جماعيًا.'); return; }
    const body = action === 'PROMOTE' || action === 'REPEAT' ? { action, targetClassMappingId: mapping?.id, targetGradeLevelId: mapping?.targetGradeLevelId } : { action };
    const result = await this.rolloverApi.patchDecisions(draft.operation.id, ids, body);
    if (result.status === 200) { this.clearSelection(); await this.loadDraft(draft.operation.id); this.showNotice(`تم تحديث ${ids.length} قرارًا.`); } else this.error.set('تعذر تطبيق التعديل الجماعي.');
  }

  private setMappingState(id: string, state: SaveState) { this.mappingSaveStates.update(states => { const next = { ...states }; if (state === 'idle') delete next[id]; else next[id] = state; return next; }); }
  private showNotice(message: string) { clearTimeout(this.noticeTimer); this.notice.set(message); this.noticeTimer = setTimeout(() => this.notice.set(''), 3500); }
  private unique(items: { id: string; label: string }[]) { return [...new Map(items.map(item => [item.id, item])).values()]; }
}
