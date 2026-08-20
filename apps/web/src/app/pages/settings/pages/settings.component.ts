import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { UiModalComponent } from '../../../shared/components/ui-modal/ui-modal.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-settings',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, RouterLink, UiModalComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css'
})
export class SettingsComponent implements OnInit {
  apiService = inject(ApiService);
  confirmDialog = inject(ConfirmDialogService);
  fb = inject(FormBuilder);

  isEditing = signal<boolean>(false);
  showLangModal = signal<boolean>(false);
  editingCode = signal<string>('');
  confirmDeleteCode = signal<string>('');

  isEditingRegion = signal<boolean>(false);
  showRegionModal = signal<boolean>(false);
  editingRegionCode = signal<string>('');
  confirmDeleteRegionCode = signal<string>('');

  showInstitutionModal = signal<boolean>(false);

  isEditingEducationType = signal<boolean>(false);
  showEducationTypeModal = signal<boolean>(false);
  editingEducationTypeCode = signal<string>('');
  confirmDeleteEducationTypeCode = signal<string>('');

  langForm = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/^[a-zA-Z]{2,3}$/)]],
    nameAr: ['', [Validators.required]],
    nameHe: [''],
    nativeName: ['', [Validators.required]],
    direction: ['rtl', [Validators.required]],
    isActive: [true],
    isSystem: [false],
    sortOrder: [0],
  });

  regionForm = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9_-]{2,20}$/)]],
    nameAr: ['', [Validators.required]],
    nameHe: [''],
    isActive: [true],
    sortOrder: [0],
  });

  institutionForm = this.fb.group({
    schoolCode: ['', [Validators.required]],
    nameAr: ['', [Validators.required]],
    nameHe: [''],
    phoneNumber: ['', [Validators.maxLength(50)]],
    email: ['', [Validators.email, Validators.maxLength(250)]],
    logoUrl: ['', [Validators.maxLength(2048)]],
    regionId: ['', [Validators.required]],
    typeId: ['', [Validators.required]],
  });

  educationTypeForm = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9_-]{2,30}$/)]],
    nameAr: ['', [Validators.required]],
    nameHe: [''],
    isActive: [true],
    isSystem: [false],
    sortOrder: [0],
  });

  appStateForm = this.fb.group({
    registrationOpen: [true],
    academicYearStatus: ['ACTIVE', [Validators.required]],
    allowedIpRanges: ['*', [Validators.required]],
    systemMaintenance: [false],
    theme: ['light', [Validators.required]],
    gradeEntryDeadline: ['2026-06-30', [Validators.required]]
  });

  async ngOnInit() {
    this.apiService.loadLookups();
    this.apiService.loadLanguages();
    this.apiService.loadRegions();
    this.apiService.loadInstitutionProfile();
    this.apiService.loadEducationTypes();
    await this.apiService.loadAppState();
    this.syncAppStateForm();
  }

  syncAppStateForm() {
    const state = this.apiService.appState();
    if (state && state.data) {
      this.appStateForm.patchValue({
        registrationOpen: state.data.registrationOpen !== false,
        academicYearStatus: state.data.academicYearStatus || 'ACTIVE',
        allowedIpRanges: Array.isArray(state.data.allowedIpRanges)
          ? state.data.allowedIpRanges.join(', ')
          : (state.data.allowedIpRanges || '*'),
        systemMaintenance: state.data.systemMaintenance === true,
        theme: state.data.theme || 'light',
        gradeEntryDeadline: state.data.gradeEntryDeadline || '2026-06-30'
      });
    }
  }

  async saveAppState() {
    if (this.appStateForm.invalid) return;
    const formValue = this.appStateForm.getRawValue();

    const ipRanges = formValue.allowedIpRanges
      ? formValue.allowedIpRanges.split(',').map(ip => ip.trim()).filter(Boolean)
      : ['*'];

    const updatedData = {
      registrationOpen: !!formValue.registrationOpen,
      academicYearStatus: formValue.academicYearStatus || 'ACTIVE',
      allowedIpRanges: ipRanges,
      systemMaintenance: !!formValue.systemMaintenance,
      theme: formValue.theme || 'light',
      gradeEntryDeadline: formValue.gradeEntryDeadline || '2026-06-30'
    };

    const ok = await this.apiService.updateAppState(updatedData);
    if (ok) {
      alert('تم حفظ وتطبيق حالة النظام الجديدة بنجاح!');
      this.syncAppStateForm();
    } else {
      alert('حدث خطأ أثناء حفظ حالة النظام');
    }
  }

  async deprecatedMaintenanceAction() {
    const res = new Response(null, { status: 404 });
    try {
      if (res.ok) {
        alert('تم تغذية قاعدة البيانات المرجعية بنجاح!');
        this.apiService.loadDashboardStats();
        this.apiService.loadLanguages();
        await this.apiService.loadAppState();
        this.syncAppStateForm();
      }
    } catch (e) {
      alert('حدث خطأ أثناء الاتصال بقاعدة البيانات');
    }
  }

  openAddModal() {
    this.isEditing.set(false);
    this.editingCode.set('');
    this.langForm.reset({
      code: '',
      nameAr: '',
      nameHe: '',
      nativeName: '',
      direction: 'rtl',
      isActive: true,
      isSystem: false,
      sortOrder: 0,
    });
    this.langForm.get('code')?.enable();
    this.showLangModal.set(true);
  }

  openEditModal(lang: any) {
    this.isEditing.set(true);
    this.editingCode.set(lang.code);
    this.langForm.setValue({
      code: lang.code,
      nameAr: lang.nameAr || '',
      nameHe: lang.nameHe || '',
      nativeName: lang.nativeName || '',
      direction: lang.direction || 'rtl',
      isActive: lang.isActive !== false,
      isSystem: lang.isSystem === true,
      sortOrder: lang.sortOrder || 0,
    });
    this.langForm.get('code')?.disable();
    this.showLangModal.set(true);
  }

  closeLangModal() {
    this.showLangModal.set(false);
    this.langForm.get('code')?.enable();
  }

  async saveLanguage() {
    if (this.langForm.invalid) return;

    const formValue = this.langForm.getRawValue();

    if (this.isEditing()) {
      const ok = await this.apiService.updateLanguage(this.editingCode(), formValue);
      if (ok) {
        this.closeLangModal();
      }
    } else {
      const ok = await this.apiService.createLanguage(formValue);
      if (ok) {
        this.closeLangModal();
      }
    }
  }

  askDelete(code: string) {
    this.confirmDeleteCode.set(code);
  }

  cancelDelete() {
    this.confirmDeleteCode.set('');
  }

  async confirmDelete(code: string) {
    const ok = await this.apiService.deleteLanguage(code);
    if (ok) {
      this.confirmDeleteCode.set('');
    }
  }

  getRegionName(code: string): string {
    const region = this.apiService.regions().find(r => r.code === code);
    return region ? region.nameAr : code;
  }

  getTypeName(typeId: string): string {
    const type = this.apiService.educationTypes().find((item: any) =>
      item.id === typeId || item.code === typeId
    );
    if (type) return type.nameAr || type.nameHe || type.code;

    const lookupType = this.apiService.lookups()?.institutionTypes?.find((item: any) =>
      item.id === typeId || item.code === typeId
    );
    return lookupType?.nameAr || lookupType?.nameHe || typeId;
  }

  openEditInstitutionModal() {
    const inst = this.apiService.institution();
    if (!inst) return;

    this.institutionForm.setValue({
      schoolCode: inst.schoolCode || '',
      nameAr: inst.nameAr || '',
      nameHe: inst.nameHe || '',
      phoneNumber: inst.phoneNumber || '',
      email: inst.email || '',
      logoUrl: inst.logoUrl || '',
      regionId: inst.regionId || '',
      typeId: inst.typeId || '',
    });
    this.showInstitutionModal.set(true);
  }

  closeInstitutionModal() {
    this.showInstitutionModal.set(false);
  }

  async saveInstitution() {
    if (this.institutionForm.invalid) return;

    const inst = this.apiService.institution();
    if (!inst) return;

    const formValue = this.institutionForm.getRawValue();
    const ok = await this.apiService.updateInstitutionProfile({
      nameAr: formValue.nameAr,
      nameHe: formValue.nameHe || null,
      phoneNumber: formValue.phoneNumber || null,
      email: formValue.email || null,
      logoUrl: formValue.logoUrl || null,
    });
    if (ok) {
      this.closeInstitutionModal();
      alert('تم تحديث بيانات المؤسسة بنجاح');
    } else {
      alert('حدث خطأ أثناء تحديث بيانات المؤسسة');
    }
  }

  openAddRegionModal() {
    this.isEditingRegion.set(false);
    this.editingRegionCode.set('');
    this.regionForm.reset({
      code: '',
      nameAr: '',
      nameHe: '',
      isActive: true,
      sortOrder: 0,
    });
    this.regionForm.get('code')?.enable();
    this.showRegionModal.set(true);
  }

  openEditRegionModal(reg: any) {
    this.isEditingRegion.set(true);
    this.editingRegionCode.set(reg.code);
    this.regionForm.setValue({
      code: reg.code,
      nameAr: reg.nameAr || '',
      nameHe: reg.nameHe || '',
      isActive: reg.isActive !== false,
      sortOrder: reg.sortOrder || 0,
    });
    this.regionForm.get('code')?.disable();
    this.showRegionModal.set(true);
  }

  closeRegionModal() {
    this.showRegionModal.set(false);
    this.regionForm.get('code')?.enable();
  }

  async saveRegion() {
    if (this.regionForm.invalid) return;

    const formValue = this.regionForm.getRawValue();

    if (this.isEditingRegion()) {
      const ok = await this.apiService.updateRegion(this.editingRegionCode(), formValue);
      if (ok) {
        this.closeRegionModal();
      }
    } else {
      const ok = await this.apiService.createRegion(formValue);
      if (ok) {
        this.closeRegionModal();
      }
    }
  }

  async deleteRegion(reg: any) {
    if (await this.confirmDialog.confirm({ title: 'حذف المنطقة', message: `هل أنت متأكد من حذف المنطقة "${reg.nameAr}"؟`, variant: 'danger' })) {
      this.confirmDeleteRegion(reg.code);
    }
  }

  askDeleteRegion(code: string) {
    this.confirmDeleteRegionCode.set(code);
  }

  cancelDeleteRegion() {
    this.confirmDeleteRegionCode.set('');
  }

  async confirmDeleteRegion(code: string) {
    const ok = await this.apiService.deleteRegion(code);
    if (ok) {
      this.confirmDeleteRegionCode.set('');
    }
  }

  openAddEducationTypeModal() {
    this.isEditingEducationType.set(false);
    this.editingEducationTypeCode.set('');
    this.educationTypeForm.reset({
      code: '',
      nameAr: '',
      nameHe: '',
      isActive: true,
      isSystem: false,
      sortOrder: 0,
    });
    this.educationTypeForm.get('code')?.enable();
    this.showEducationTypeModal.set(true);
  }

  openEditEducationTypeModal(edu: any) {
    this.isEditingEducationType.set(true);
    this.editingEducationTypeCode.set(edu.code);
    this.educationTypeForm.setValue({
      code: edu.code,
      nameAr: edu.nameAr || '',
      nameHe: edu.nameHe || '',
      isActive: edu.isActive !== false,
      isSystem: edu.isSystem === true,
      sortOrder: edu.sortOrder || 0,
    });
    this.educationTypeForm.get('code')?.disable();
    this.showEducationTypeModal.set(true);
  }

  closeEducationTypeModal() {
    this.showEducationTypeModal.set(false);
    this.educationTypeForm.get('code')?.enable();
  }

  async saveEducationType() {
    if (this.educationTypeForm.invalid) return;

    const formValue = this.educationTypeForm.getRawValue();

    if (this.isEditingEducationType()) {
      const ok = await this.apiService.updateEducationType(this.editingEducationTypeCode(), formValue);
      if (ok) {
        this.closeEducationTypeModal();
      }
    } else {
      const ok = await this.apiService.createEducationType(formValue);
      if (ok) {
        this.closeEducationTypeModal();
      }
    }
  }

  async deleteEducationType(type: any) {
    if (await this.confirmDialog.confirm({ title: 'حذف نوع التعليم', message: `هل أنت متأكد من حذف نوع التعليم "${type.nameAr}"؟`, variant: 'danger' })) {
      this.confirmDeleteEducationType(type.code);
    }
  }

  askDeleteEducationType(code: string) {
    this.confirmDeleteEducationTypeCode.set(code);
  }

  cancelDeleteEducationType() {
    this.confirmDeleteEducationTypeCode.set('');
  }

  async confirmDeleteEducationType(code: string) {
    const ok = await this.apiService.deleteEducationType(code);
    if (ok) {
      this.confirmDeleteEducationTypeCode.set('');
    }
  }
}
