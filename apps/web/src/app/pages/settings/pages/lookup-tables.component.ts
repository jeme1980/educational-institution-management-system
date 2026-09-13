import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { UiModalComponent } from '../../../shared/components/ui-modal/ui-modal.component';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { UiInputComponent } from '../../../shared/components/input/ui-input.component';
import { UiBadgeComponent } from '../../../shared/components/ui-badge/ui-badge.component';
import { UiTableActionsComponent } from '../../../shared/components/ui-table-actions/ui-table-actions.component';
import { HasPermissionDirective } from '../../../core/directives/has-permission.directive';

type InstitutionLookupKey = 'specializations' | 'jobRoles' | 'examTypes' | 'questionTypes';

interface InstitutionLookupDefinition {
  key: InstitutionLookupKey;
  label: string;
  icon: string;
  singularLabel: string;
  emptyMessage: string;
  hasTeachingRole?: boolean;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-lookup-tables',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, RouterLink, UiButtonComponent, UiModalComponent, UiInputComponent, UiBadgeComponent, UiTableActionsComponent, HasPermissionDirective],
  templateUrl: './lookup-tables.component.html',
  styleUrl: './lookup-tables.component.css',
})
export class LookupTablesComponent implements OnInit {
  readonly confirmDialog = inject(ConfirmDialogService);
  readonly apiService = inject(ApiService);
  private readonly fb = inject(FormBuilder);

  readonly definitions: InstitutionLookupDefinition[] = [
    { key: 'specializations', label: 'التخصصات', singularLabel: 'تخصص', emptyMessage: 'لا توجد تخصصات.', icon: 'workspace_premium' },
    { key: 'jobRoles', label: 'المسميات الوظيفية', singularLabel: 'مسمى وظيفي', emptyMessage: 'لا توجد مسميات وظيفية.', icon: 'badge', hasTeachingRole: true },
    { key: 'examTypes', label: 'أنواع الامتحانات', singularLabel: 'نوع امتحان', emptyMessage: 'لا توجد أنواع امتحانات.', icon: 'quiz' },
    { key: 'questionTypes', label: 'أنواع الأسئلة', singularLabel: 'نوع سؤال', emptyMessage: 'لا توجد أنواع أسئلة.', icon: 'help_outline' },
  ];

  readonly activeTable = signal<InstitutionLookupKey>('specializations');
  readonly searchTerm = signal('');
  readonly showModal = signal(false);
  readonly editingItem = signal<any | null>(null);
  readonly isSubmitting = signal(false);
  readonly toast = signal<{ message: string; type: 'success' | 'error' } | null>(null);
  readonly currentDefinition = computed(() => this.definitions.find((definition) => definition.key === this.activeTable())!);

  readonly form = this.fb.nonNullable.group({
    nameAr: ['', [Validators.required, Validators.maxLength(150)]],
    nameHe: ['', Validators.maxLength(150)],
    sortOrder: [0],
    isActive: [true],
    isTeachingRole: [false],
  });

  readonly currentItems = computed(() => {
    const table = this.activeTable();
    if (table === 'jobRoles') return this.apiService.jobRoles();
    return this.apiService.publicLookups()[table] || [];
  });

  readonly filteredItems = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    if (!search) return this.currentItems();
    return this.currentItems().filter((item) => `${item.nameAr || ''} ${item.nameHe || ''}`.toLowerCase().includes(search));
  });

  ngOnInit(): void {
    void this.apiService.loadInstitutions();
    void this.apiService.loadPublicLookups();
    void this.apiService.loadJobRoles();
  }

  selectTable(key: InstitutionLookupKey): void {
    this.activeTable.set(key);
    this.searchTerm.set('');
    this.closeModal();
  }

  onSearch(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  openAddModal(): void {
    this.editingItem.set(null);
    this.form.reset({ nameAr: '', nameHe: '', sortOrder: 0, isActive: true, isTeachingRole: false });
    this.showModal.set(true);
  }

  openEditModal(item: any): void {
    this.editingItem.set(item);
    this.form.reset({
      nameAr: item.nameAr || '',
      nameHe: item.nameHe || '',
      sortOrder: item.sortOrder || 0,
      isActive: item.isActive !== false,
      isTeachingRole: item.isTeachingRole === true,
    });
    this.showModal.set(true);
  }

  closeModal(): void {
    if (this.isSubmitting()) return;
    this.showModal.set(false);
    this.editingItem.set(null);
  }

  async saveItem(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.isSubmitting.set(true);
    const raw = this.form.getRawValue();
    const table = this.activeTable();
    const editing = this.editingItem();
    const commonPayload = {
      nameAr: raw.nameAr.trim(),
      nameHe: raw.nameHe.trim() || null,
      isActive: raw.isActive,
      sortOrder: Number(raw.sortOrder || 0),
    };
    const payload = table === 'jobRoles'
      ? {
          ...commonPayload,
          institutionId: this.apiService.selectedInstitutionId() || this.apiService.institutions()[0]?.id || '',
          isTeachingRole: raw.isTeachingRole,
        }
      : commonPayload;
    const saved = table === 'jobRoles'
      ? (editing ? await this.apiService.updateJobRole(editing.id, payload) : await this.apiService.createJobRole(payload))
      : (editing ? await this.apiService.updatePublicLookup(table, editing.id, payload) : await this.apiService.createPublicLookup(table, payload));
    this.isSubmitting.set(false);
    if (saved) {
      this.refreshExamFormLookups(table);
      this.showToast(editing ? 'تم تعديل السجل بنجاح' : 'تمت إضافة السجل بنجاح', 'success');
      this.closeModal();
      return;
    }
    this.showToast(table === 'jobRoles' && this.apiService.usersApi.jobRoleError()
      ? this.apiService.usersApi.jobRoleError()!
      : this.apiService.lookupMutationError() || 'تعذر حفظ السجل. تحقق من البيانات أو الارتباطات الحالية.', 'error');
  }

  async deleteItem(item: any): Promise<void> {
    const definition = this.currentDefinition();
    if (!await this.confirmDialog.confirm({ title: `حذف ${definition.singularLabel}؟`, message: `هل تريد حذف ${definition.singularLabel} "${item.nameAr}"؟`, variant: 'danger' })) return;
    const table = this.activeTable();
    const deleted = table === 'jobRoles'
      ? await this.apiService.deleteJobRole(item.id)
      : await this.apiService.deletePublicLookup(table, item.id);
    if (deleted) this.refreshExamFormLookups(table);
    this.showToast(deleted ? 'تم حذف السجل بنجاح' : this.apiService.lookupMutationError() || 'تعذر حذف السجل، قد يكون مرتبطًا ببيانات أخرى', deleted ? 'success' : 'error');
  }

  private refreshExamFormLookups(table: InstitutionLookupKey): void {
    if (table === 'examTypes') this.apiService.examTypes.set((this.apiService.publicLookups()['examTypes'] || []).filter((item) => item.isActive !== false));
    if (table === 'questionTypes') this.apiService.questionTypes.set((this.apiService.publicLookups()['questionTypes'] || []).filter((item) => item.isActive !== false));
  }

  private showToast(message: string, type: 'success' | 'error'): void {
    this.toast.set({ message, type });
    setTimeout(() => this.toast.set(null), 3500);
  }
}
