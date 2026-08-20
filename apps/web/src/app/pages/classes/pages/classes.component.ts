import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ApiService, ClassItem, ClassFormValue, LookupItem } from '../../../core/services/api.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../../shared/components/input/ui-input.component';
import { UiSelectComponent } from '../../../shared/components/select/ui-select.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-classes',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, UiButtonComponent, UiInputComponent, UiSelectComponent],
  templateUrl: './classes.component.html',
  styleUrl: './classes.component.css',
})
export class ClassesComponent implements OnInit {
  readonly apiService = inject(ApiService);
  readonly confirmDialog = inject(ConfirmDialogService);
  private readonly fb = inject(FormBuilder);

  readonly searchTerm = signal('');
  readonly stageFilter = signal('');
  readonly typeFilter = signal('');
  readonly showModal = signal(false);
  readonly showDetailsModal = signal(false);
  readonly editingClass = signal<ClassItem | null>(null);
  readonly selectedClassDetails = signal<ClassItem | null>(null);
  readonly isSaving = signal(false);
  readonly isDeleting = signal<string | null>(null);
  readonly isLoading = signal(true);
  readonly pageError = signal('');
  readonly toast = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  readonly classForm = this.fb.nonNullable.group({
    institutionId: ['', Validators.required],
    academicYearId: ['', Validators.required],
    stageId: ['', Validators.required],
    gradeLevelId: ['', Validators.required],
    parallelNumber: [1, [Validators.required, Validators.min(1), Validators.pattern(/^[1-9]\d*$/)]],
    classCode: [{ value: '', disabled: true }],
    nameAr: ['', [Validators.required, Validators.maxLength(120)]],
    nameHe: ['', Validators.maxLength(120)],
    typeId: ['', Validators.required],
    compositionId: ['', Validators.required],
  });

  readonly educationStages = computed(() => this.apiService.educationStages());
  readonly gradeLevels = computed(() => this.apiService.gradeLevels());
  readonly classTypes = computed(() => this.apiService.classTypes());
  readonly compositionTypes = computed(() => this.apiService.compositionTypes());
  readonly activeContextLabel = computed(() => this.apiService.academicYears().find(y => y.id === this.academicYearId())?.yearLabel || 'السنة الحالية');
  readonly totalClasses = computed(() => this.apiService.classes().length);
  readonly regularClassesCount = computed(() => this.countClassesByType('عادي'));
  readonly specialClassesCount = computed(() => this.countClassesByType('خاص'));
  readonly parallelCount = computed(() => new Set(this.apiService.classes().map(item => `${item.gradeLevelId}:${item.parallelNumber}`)).size);
  readonly studentCountByClass = computed(() => {
    const counts = new Map<string, number>();
    for (const entry of this.apiService.enrollments() || []) {
      const enrollment = (entry as any)?.enrollment;
      if (enrollment?.isDeleted === true) continue;
      const classId = enrollment?.classId || (entry as any)?.classRoom?.id;
      if (classId) counts.set(classId, (counts.get(classId) || 0) + 1);
    }
    return counts;
  });

  readonly filteredClasses = computed(() => {
    const search = this.searchTerm().trim().toLocaleLowerCase('ar');
    return this.apiService.classes().filter(item => {
      if (this.stageFilter() && item.stageId !== this.stageFilter()) return false;
      if (this.typeFilter() && item.typeId !== this.typeFilter()) return false;
      if (!search) return true;
      return [item.nameAr, item.nameHe, this.getGradeLabel(item), this.getStageLabel(item.stageId), this.getTypeLabel(item.typeId), item.parallelNumber]
        .some(value => String(value ?? '').toLocaleLowerCase('ar').includes(search));
    });
  });

  ngOnInit(): void {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.isLoading.set(true);
    this.pageError.set('');
    try {
      await Promise.all([this.apiService.loadLookups(), this.apiService.loadInstitutions(), this.apiService.loadAcademicYears()]);
      if (!this.apiService.selectedInstitutionId()) this.apiService.setSelectedInstitutionId(this.institutionId());
      if (!this.apiService.selectedAcademicYearId()) this.apiService.setSelectedAcademicYearId(this.academicYearId());
      await Promise.all([
        this.apiService.loadClasses(),
        this.apiService.loadEnrollments(),
      ]);
    } catch {
      this.pageError.set('تعذر تحميل بيانات الصفوف والشعب. تحقق من الاتصال ثم أعد المحاولة.');
    } finally {
      this.isLoading.set(false);
    }
  }

  clearFilters(): void { this.searchTerm.set(''); this.stageFilter.set(''); this.typeFilter.set(''); }
  updateSearch(event: Event): void { this.searchTerm.set((event.target as HTMLInputElement).value); }
  onStageFilterChange(event: Event): void { this.stageFilter.set((event.target as HTMLSelectElement).value); }
  onTypeFilterChange(event: Event): void { this.typeFilter.set((event.target as HTMLSelectElement).value); }

  getStageLabel(id?: string): string { return this.findLookup(this.educationStages(), id)?.nameAr || 'غير محددة'; }
  getGradeLabel(item: ClassItem): string { return item.gradeLevel || item.gradeLevelInfo?.nameAr || this.gradeLevels().find(g => g.id === item.gradeLevelId)?.nameAr || 'غير محدد'; }
  getTypeLabel(id?: string): string { return this.findLookup(this.classTypes(), id)?.nameAr || 'غير محدد'; }
  getCompositionLabel(id?: string): string { return this.findLookup(this.compositionTypes(), id)?.nameAr || 'غير محددة'; }
  getAcademicYearLabel(id?: string): string { return this.apiService.academicYears().find(year => year.id === id)?.yearLabel || 'غير محددة'; }
  getInstitutionLabel(id?: string): string { return this.apiService.institutions().find(institution => institution.id === id)?.nameAr || 'غير محددة'; }
  getStudentCount(item: ClassItem): number {
    return this.studentCountByClass().get(item.id) ?? item.studentCount ?? 0;
  }
  private countClassesByType(typeMarker: string): number {
    const typeIds = new Set(this.classTypes()
      .filter(type => String(type.nameAr || '').includes(typeMarker))
      .map(type => type.id));
    return this.apiService.classes().filter(item => typeIds.has(item.typeId)).length;
  }
  private findLookup(items: LookupItem[], id?: string): LookupItem | undefined { return id ? items.find(item => item.id === id) : undefined; }
  private firstId<T extends LookupItem>(items: T[]): string { return items.find(item => item.isActive !== false)?.id || items[0]?.id || ''; }
  private institutionId(): string { return this.apiService.selectedInstitutionId() || this.apiService.institutions()[0]?.id || ''; }
  private academicYearId(): string { return this.apiService.selectedAcademicYearId() || this.apiService.academicYears().find(y => y.isCurrent)?.id || this.apiService.academicYears()[0]?.id || ''; }

  openAddModal(): void {
    this.editingClass.set(null);
    this.classForm.reset({ institutionId: this.institutionId(), academicYearId: this.academicYearId(), stageId: this.firstId(this.educationStages()), gradeLevelId: this.firstId(this.gradeLevels()), parallelNumber: 1, classCode: '', nameAr: '', nameHe: '', typeId: this.firstId(this.classTypes()), compositionId: this.firstId(this.compositionTypes()) });
    this.updateClassCode();
    this.showModal.set(true);
  }

  openEditModal(item: ClassItem): void {
    this.editingClass.set(item);
    this.classForm.reset({ institutionId: item.institutionId, academicYearId: item.academicYearId, stageId: item.stageId, gradeLevelId: item.gradeLevelId, parallelNumber: item.parallelNumber, classCode: item.classCode || '', nameAr: item.nameAr, nameHe: item.nameHe || '', typeId: item.typeId, compositionId: item.compositionId });
    this.showModal.set(true);
  }

  updateClassCode(): void {
    const gradeId = this.classForm.controls.gradeLevelId.value;
    const parallel = Number(this.classForm.controls.parallelNumber.value);
    const grade = this.gradeLevels().find(item => item.id === gradeId);
    const code = grade?.codeNumber != null && Number.isInteger(parallel) && parallel > 0
      ? `${grade.codeNumber}-${parallel}`
      : '';
    this.classForm.controls.classCode.setValue(code);
  }

  closeModal(): void { if (!this.isSaving()) { this.showModal.set(false); this.editingClass.set(null); } }
  viewClassDetails(item: ClassItem): void { this.selectedClassDetails.set(item); this.showDetailsModal.set(true); }

  async saveClass(): Promise<void> {
    if (this.classForm.invalid || this.isSaving()) { this.classForm.markAllAsTouched(); return; }
    this.isSaving.set(true);
    const isEditing = !!this.editingClass();
    const value = this.classForm.getRawValue() as ClassFormValue;
    const success = isEditing ? await this.apiService.updateClass(this.editingClass()!.id, value) : await this.apiService.createClass(value);
    this.isSaving.set(false);
    if (success) { this.closeModal(); this.notify('success', isEditing ? 'تم تحديث بيانات الشعبة بنجاح.' : 'تمت إضافة الشعبة بنجاح.'); }
    else this.notify('error', this.apiService.classesApi.lastError() || 'تعذر حفظ البيانات.');
  }

  async deleteClass(item: ClassItem): Promise<void> {
    if (this.isDeleting()) return;
    const confirmed = await this.confirmDialog.confirm({ title: 'حذف أو أرشفة الشعبة', message: `سيتم حذف أو أرشفة «${item.nameAr}». هل تريد المتابعة؟`, variant: 'warning' });
    if (!confirmed) return;
    this.isDeleting.set(item.id);
    const success = await this.apiService.deleteClass(item.id);
    this.isDeleting.set(null);
    if (success) this.notify('success', 'تم تنفيذ العملية بنجاح.');
    else this.notify('error', 'تعذر حذف الشعبة. تحقق من الصلاحيات والارتباطات.');
  }

  private notify(type: 'success' | 'error', message: string): void { this.toast.set({ type, message }); setTimeout(() => this.toast.set(null), 3500); }
}
