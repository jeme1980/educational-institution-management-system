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
import { ClassMapping, PreviewResult, RolloverAction, RolloverApiService, RolloverDraft, StudentDecision } from '../services/rollover-api.service';

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
  readonly executeAvailable = false;
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
    if (result.status === 200 && result.body) { this.draft.set(result.body); this.sourceId.set(result.body.sourceYear.id); this.targetId.set(result.body.targetYear.id); if (this.step() === 1) this.step.set(2); }
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

  markMappingDirty(id: string) { this.setMappingState(id, 'dirty'); }
  openMappingEditor(mapping: ClassMapping) {
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
    const draft = this.draft(); if (!draft || !['CREATE', 'USE_EXISTING', 'SKIP'].includes(actionValue)) return;
    const action = actionValue as 'CREATE' | 'USE_EXISTING' | 'SKIP';
    const body = action === 'SKIP' ? { action } : action === 'USE_EXISTING' ? { action, targetClassId: mapping.targetClassId } : { action, targetStageId: mapping.targetStageId, targetGradeLevelId: mapping.targetGradeLevelId, targetParallelNumber: Number(parallelValue), targetNameAr: targetNameAr.trim(), targetNameHe: targetNameHe.trim() || null };
    if (action === 'USE_EXISTING' && !mapping.targetClassId) { this.setMappingState(mapping.id, 'error'); this.error.set('اختر شعبة هدف موجودة قبل الحفظ.'); return; }
    if (action === 'CREATE' && (!mapping.targetStageId || !mapping.targetGradeLevelId || !Number(parallelValue) || !targetNameAr.trim())) { this.setMappingState(mapping.id, 'dirty'); return; }
    this.setMappingState(mapping.id, 'saving');
    const result = await this.rolloverApi.patchMapping(draft.operation.id, mapping.id, body);
    if (result.status === 200) { await this.loadDraft(draft.operation.id); this.setMappingState(mapping.id, 'saved'); setTimeout(() => this.setMappingState(mapping.id, 'idle'), 2200); }
    else { this.setMappingState(mapping.id, 'error'); this.error.set('تعذر حفظ ربط الصف. راجع بيانات المرحلة والطبقة والشعبة.'); }
  }

  toggle(id: string, checked: boolean) { const next = new Set(this.selected()); if (checked) next.add(id); else next.delete(id); this.selected.set(next); }
  toggleFromEvent(id: string, event: Event) { this.toggle(id, (event.target as HTMLInputElement).checked); }
  toggleAll(event: Event) { const checked = (event.target as HTMLInputElement).checked; this.selected.set(checked ? new Set(this.filteredDecisions().map(row => row.id)) : new Set()); }
  clearSelection() { this.selected.set(new Set()); this.bulkAction.set(''); }

  async changeDecision(item: StudentDecision, actionValue: string) {
    const draft = this.draft(); if (!draft || !['PROMOTE', 'REPEAT', 'GRADUATE', 'SKIP'].includes(actionValue)) return;
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
    const draft = this.draft(); const ids = [...this.selected()]; if (!draft || !ids.length) return;
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
