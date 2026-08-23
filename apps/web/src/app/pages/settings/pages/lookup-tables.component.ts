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

type InstitutionLookupKey = 'specializations' | 'jobRoles';

interface InstitutionLookupDefinition {
  key: InstitutionLookupKey;
  label: string;
  icon: string;
  hasTeachingRole?: boolean;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-lookup-tables',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, RouterLink, UiButtonComponent, UiModalComponent, UiInputComponent],
  templateUrl: './lookup-tables.component.html',
  styleUrl: './lookup-tables.component.css',
})
export class LookupTablesComponent implements OnInit {
  readonly confirmDialog = inject(ConfirmDialogService);
  readonly apiService = inject(ApiService);
  private readonly fb = inject(FormBuilder);

  readonly definitions: InstitutionLookupDefinition[] = [
    { key: 'specializations', label: 'التخصصات', icon: 'workspace_premium' },
    { key: 'jobRoles', label: 'المسميات الوظيفية', icon: 'badge', hasTeachingRole: true },
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
    void this.apiService.loadQuestionTypes();
    void this.apiService.loadExamTypes();
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
      this.showToast(editing ? 'تم تعديل السجل بنجاح' : 'تمت إضافة السجل بنجاح', 'success');
      this.closeModal();
      return;
    }
    this.showToast(table === 'jobRoles' && this.apiService.usersApi.jobRoleError()
      ? this.apiService.usersApi.jobRoleError()!
      : 'تعذر حفظ السجل. تحقق من البيانات أو الارتباطات الحالية.', 'error');
  }

  async deleteItem(item: any): Promise<void> {
    if (!await this.confirmDialog.confirm({ title: 'حذف السجل', message: `هل تريد حذف السجل "${item.nameAr}"؟`, variant: 'danger' })) return;
    const table = this.activeTable();
    const deleted = table === 'jobRoles'
      ? await this.apiService.deleteJobRole(item.id)
      : await this.apiService.deletePublicLookup(table, item.id);
    this.showToast(deleted ? 'تم حذف السجل بنجاح' : 'تعذر حذف السجل، قد يكون مرتبطًا ببيانات أخرى', deleted ? 'success' : 'error');
  }

  private showToast(message: string, type: 'success' | 'error'): void {
    this.toast.set({ message, type });
    setTimeout(() => this.toast.set(null), 3500);
  }
}
