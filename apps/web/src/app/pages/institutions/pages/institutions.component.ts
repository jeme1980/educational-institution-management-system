import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../core/services/api.service';
import { InstitutionItem } from '../models/institution.model';
import { InstitutionsHeaderComponent } from '../components/institutions-header.component';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../../shared/components/input/ui-input.component';
import { UiSelectComponent } from '../../../shared/components/select/ui-select.component';
import { UiTextareaComponent } from '../../../shared/components/textarea/ui-textarea.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-institutions',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, InstitutionsHeaderComponent, UiButtonComponent, UiInputComponent, UiSelectComponent, UiTextareaComponent],
  templateUrl: './institutions.component.html',
  styleUrl: './institutions.component.css',
})
export class InstitutionsComponent implements OnInit {
  readonly apiService = inject(ApiService);
  readonly confirmDialog = inject(ConfirmDialogService);
  private readonly fb = inject(FormBuilder);
  readonly searchTerm = signal('');
  readonly statusFilter = signal('');
  readonly typeFilter = signal('');
  readonly regionFilter = signal('');
  readonly showModal = signal(false);
  readonly editingInstitution = signal<InstitutionItem | null>(null);
  readonly selectedInstitution = signal<InstitutionItem | null>(null);
  readonly isSaving = signal(false);
  readonly deletingId = signal<string | null>(null);
  readonly toast = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  readonly form = this.fb.nonNullable.group({
    schoolCode: ['', [Validators.required, Validators.maxLength(20)]],
    slug: ['', [Validators.required, Validators.maxLength(80), Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)]],
    nameAr: ['', [Validators.required, Validators.maxLength(200)]],
    nameHe: ['', Validators.maxLength(200)],
    phoneNumber: ['', Validators.maxLength(50)],
    email: ['', [Validators.email, Validators.maxLength(250)]],
    typeId: ['', Validators.required],
    regionId: ['', Validators.required],
    townId: [''],
    statusId: ['', Validators.required],
    defaultLanguageId: ['', Validators.required],
    logoUrl: ['', Validators.maxLength(500)],
    brandingJson: [''],
  });

  readonly institutions = computed(() => this.apiService.institutions() as InstitutionItem[]);
  readonly filteredInstitutions = computed(() => {
    const q = this.searchTerm().trim().toLocaleLowerCase('ar');
    return this.institutions().filter(item => {
      const matchesQuery = !q || [item.nameAr, item.nameHe, item.schoolCode, item.slug, item.email, item.phoneNumber]
        .some(value => String(value || '').toLocaleLowerCase('ar').includes(q));
      return matchesQuery && (!this.statusFilter() || item.statusId === this.statusFilter()) && (!this.typeFilter() || item.typeId === this.typeFilter()) && (!this.regionFilter() || item.regionId === this.regionFilter());
    });
  });
  readonly activeCount = computed(() => this.institutions().filter(item => item.status?.isActive !== false).length);
  readonly archivedCount = computed(() => this.institutions().filter(item => !!item.archivedAt).length);
  readonly studentsCount = computed(() => this.institutions().reduce((sum, item) => sum + (item._count?.students || 0), 0));

  ngOnInit(): void { void this.refresh(); }

  async refresh(): Promise<void> {
    await Promise.all([
      this.apiService.loadInstitutions(), this.apiService.loadLookups(), this.apiService.loadEducationTypes(),
      this.apiService.loadRegions(), this.apiService.loadLanguages(), this.apiService.loadTowns(),
    ]);
  }

  updateSignal(target: 'search' | 'status' | 'type' | 'region', event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    if (target === 'search') this.searchTerm.set(value);
    if (target === 'status') this.statusFilter.set(value);
    if (target === 'type') this.typeFilter.set(value);
    if (target === 'region') this.regionFilter.set(value);
  }

  clearFilters(): void { this.searchTerm.set(''); this.statusFilter.set(''); this.typeFilter.set(''); this.regionFilter.set(''); }
  get statuses(): any[] { return this.apiService.lookups()?.institutionStatuses || []; }
  get educationTypes(): any[] { return this.apiService.educationTypes(); }
  get regions(): any[] { return this.apiService.regions(); }
  get languages(): any[] { return this.apiService.languages(); }
  get towns(): any[] { return this.apiService.towns(); }
  statusName(item: InstitutionItem): string { return item.status?.nameAr || 'غير محددة'; }
  typeName(item: InstitutionItem): string { return item.type?.nameAr || 'غير محدد'; }
  regionName(item: InstitutionItem): string { return item.region?.nameAr || 'غير محددة'; }

  openAddModal(): void {
    this.editingInstitution.set(null);
    this.form.reset({ schoolCode: '', slug: '', nameAr: '', nameHe: '', phoneNumber: '', email: '', typeId: this.educationTypes[0]?.id || '', regionId: this.regions[0]?.id || '', townId: '', statusId: this.statuses.find(item => item.isActive)?.id || this.statuses[0]?.id || '', defaultLanguageId: this.languages.find(item => item.direction === 'rtl')?.id || this.languages[0]?.id || '', logoUrl: '', brandingJson: '' });
    this.showModal.set(true);
  }

  openEditModal(item: InstitutionItem): void {
    this.editingInstitution.set(item);
    this.form.reset({ schoolCode: item.schoolCode, slug: item.slug, nameAr: item.nameAr, nameHe: item.nameHe || '', phoneNumber: item.phoneNumber || '', email: item.email || '', typeId: item.typeId, regionId: item.regionId, townId: item.townId || '', statusId: item.statusId, defaultLanguageId: item.defaultLanguageId, logoUrl: item.logoUrl || '', brandingJson: item.brandingSettings ? JSON.stringify(item.brandingSettings, null, 2) : '' });
    this.showModal.set(true);
  }

  viewDetails(item: InstitutionItem): void { this.selectedInstitution.set(item); }
  closeModal(): void { if (!this.isSaving()) { this.showModal.set(false); this.editingInstitution.set(null); } }
  onNameInput(event: Event): void {
    if (this.editingInstitution()) return;
    const name = (event.target as HTMLInputElement).value.trim().toLowerCase();
    if (!this.form.controls.slug.dirty) this.form.controls.slug.setValue(name.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.isSaving()) { this.form.markAllAsTouched(); return; }
    this.isSaving.set(true);
    const value = this.form.getRawValue();
    let brandingSettings: Record<string, unknown> | null = null;
    if (value.brandingJson.trim()) {
      try { brandingSettings = JSON.parse(value.brandingJson); } catch { this.notify('error', 'إعدادات الهوية يجب أن تكون بصيغة JSON صحيحة.'); this.isSaving.set(false); return; }
    }
    const payload = { schoolCode: value.schoolCode.trim(), slug: value.slug.trim(), nameAr: value.nameAr.trim(), nameHe: value.nameHe.trim() || null, phoneNumber: value.phoneNumber.trim() || null, email: value.email.trim() || null, typeId: value.typeId, regionId: value.regionId, townId: value.townId || null, statusId: value.statusId, defaultLanguageId: value.defaultLanguageId, logoUrl: value.logoUrl.trim() || null, brandingSettings };
    const editing = this.editingInstitution();
    const ok = editing ? await this.apiService.updateInstitution(editing.id, payload) : await this.apiService.createInstitution(payload);
    this.isSaving.set(false);
    if (ok) { this.closeModal(); this.notify('success', editing ? 'تم تعديل المؤسسة بنجاح.' : 'تمت إضافة المؤسسة بنجاح.'); }
    else this.notify('error', this.apiService.settingsApi.institutionError() || 'تعذر حفظ المؤسسة.');
  }

  async delete(item: InstitutionItem): Promise<void> {
    if (this.deletingId() || !await this.confirmDialog.confirm({ title: 'أرشفة المؤسسة', message: `سيتم أرشفة مؤسسة «${item.nameAr}». هل تريد المتابعة؟`, variant: 'warning' })) return;
    this.deletingId.set(item.id);
    const ok = await this.apiService.deleteInstitution(item.id);
    this.deletingId.set(null);
    this.notify(ok ? 'success' : 'error', ok ? 'تمت أرشفة المؤسسة بنجاح.' : (this.apiService.settingsApi.institutionError() || 'تعذر أرشفة المؤسسة.'));
  }

  private notify(type: 'success' | 'error', message: string): void { this.toast.set({ type, message }); setTimeout(() => this.toast.set(null), 4000); }
}
