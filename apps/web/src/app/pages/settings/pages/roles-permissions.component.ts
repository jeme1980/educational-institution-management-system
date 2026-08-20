import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormControl, Validators, FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { RoleWithPermissions } from '../models/settings.model';
import { Permission } from '../../../core/models/auth.models';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-roles-permissions',
  imports: [CommonModule, ReactiveFormsModule, FormsModule, MatIconModule, RouterLink],
  templateUrl: './roles-permissions.component.html',
  styleUrl: './roles-permissions.component.css'
})
export class RolesPermissionsComponent implements OnInit {
  private apiService = inject(ApiService);
  private confirmDialog = inject(ConfirmDialogService);

  // Core Data
  roles = signal<RoleWithPermissions[]>([]);
  permissions = signal<Permission[]>([]);

  // Selected state
  selectedRole = signal<RoleWithPermissions | null>(null);
  
  // Logical Modules mapping
  modules = signal<{ code: string; name: string }[]>([
    { code: 'students', name: 'إدارة شؤون الطلاب والسجلات الطبية' },
    { code: 'teachers', name: 'إدارة شؤون الكادر التعليمي والتعيينات' },
    { code: 'exams', name: 'إدارة الامتحانات وتوزيع بنوك الأسئلة ورصد العلامات' },
    { code: 'settings', name: 'إدارة إعدادات النظام والجداول المساعدة للمؤسسة' }
  ]);

  // Loading & Action states
  isLoading = signal<boolean>(true);
  isSavingMatrix = signal<boolean>(false);
  isSubmittingForm = signal<boolean>(false);
  successMessage = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  // Form Modals
  showRoleFormModal = signal<boolean>(false);
  isEditMode = signal<boolean>(false);

  // Set of selected permission IDs for the active role (local edits)
  activePermissionIds = new Set<string>();

  // Role Form
  roleForm = new FormGroup({
    code: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[A-Z_]+$/)] }),
    nameAr: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    descriptionAr: new FormControl('', { nonNullable: true })
  });

  ngOnInit() {
    this.loadData();
  }

  async loadData() {
    this.isLoading.set(true);
    try {
      // 1. Fetch system permissions
      const permsRes = await this.apiService.apiFetch('/api/permissions');
      if (permsRes.ok) {
        this.permissions.set(await permsRes.json());
      }

      // 2. Fetch school roles list
      const rolesRes = await this.apiService.apiFetch('/api/roles');
      if (rolesRes.ok) {
        const rolesList = await rolesRes.json();
        this.roles.set(rolesList);
        
        // Auto select first role if available and none selected
        if (rolesList.length > 0 && !this.selectedRole()) {
          this.selectRole(rolesList[0]);
        } else if (this.selectedRole()) {
          // Keep selection synchronized on reload
          const updatedRole = rolesList.find((r: any) => r.id === this.selectedRole()?.id);
          if (updatedRole) this.selectRole(updatedRole);
        }
      }
    } catch (e) {
      console.error(e);
      this.errorMessage.set('تعذر جلب الأدوار والصلاحيات من خادم النظام.');
    } finally {
      this.isLoading.set(false);
    }
  }

  selectRole(role: RoleWithPermissions) {
    this.selectedRole.set(role);
    this.activePermissionIds.clear();
    role.permissionIds.forEach((id: string) => this.activePermissionIds.add(id));
  }

  getPermissionsByModule(moduleCode: string): Permission[] {
    return this.permissions().filter(p => p.code.startsWith(moduleCode));
  }

  isPermissionSelected(permissionId: string): boolean {
    return this.activePermissionIds.has(permissionId);
  }

  togglePermissionSelection(event: any, permissionId: string) {
    if (event.target.checked) {
      this.activePermissionIds.add(permissionId);
    } else {
      this.activePermissionIds.delete(permissionId);
    }
  }

  isAllModulePermissionsSelected(moduleCode: string): boolean {
    const modulePerms = this.getPermissionsByModule(moduleCode);
    if (modulePerms.length === 0) return false;
    return modulePerms.every(p => this.activePermissionIds.has(p.id));
  }

  toggleAllModulePermissions(event: any, moduleCode: string) {
    const modulePerms = this.getPermissionsByModule(moduleCode);
    if (event.target.checked) {
      modulePerms.forEach(p => this.activePermissionIds.add(p.id));
    } else {
      modulePerms.forEach(p => this.activePermissionIds.delete(p.id));
    }
  }

  resetSelectedRolePermissions() {
    const role = this.selectedRole();
    if (role) {
      this.selectRole(role);
      this.successMessage.set('تمت استعادة مصفوفة الصلاحيات لحالتها الأصلية المحفوظة.');
    }
  }

  async savePermissionsMatrix() {
    const role = this.selectedRole();
    if (!role || role.isSystem) return;

    this.isSavingMatrix.set(true);
    this.errorMessage.set(null);

    const payload = {
      ...role,
      permissionIds: Array.from(this.activePermissionIds)
    };

    try {
      const response = await this.apiService.apiFetch(`/api/roles/${role.id}`, {
        method: 'PUT',
        headers: this.apiService.headers,
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        this.successMessage.set(`تم حفظ وتطبيق مصفوفة صلاحيات الوصول للدور ${role.nameAr} بنجاح.`);
        await this.loadData();
      } else {
        const err = await response.json();
        this.errorMessage.set(err.error || 'عذراً، فشل تحديث مصفوفة الصلاحيات.');
      }
    } catch (e) {
      console.error(e);
      this.errorMessage.set('فشل الاتصال بالخادم لحفظ التعديلات.');
    } finally {
      this.isSavingMatrix.set(false);
    }
  }

  openAddRoleModal() {
    this.isEditMode.set(false);
    this.roleForm.reset({ code: '', nameAr: '', descriptionAr: '' });
    this.showRoleFormModal.set(true);
  }

  openEditRoleModal(role: RoleWithPermissions) {
    this.isEditMode.set(true);
    this.roleForm.setValue({
      code: role.code,
      nameAr: role.nameAr,
      descriptionAr: role.descriptionAr || ''
    });
    this.showRoleFormModal.set(true);
  }

  async saveRole() {
    if (this.roleForm.invalid) return;

    this.isSubmittingForm.set(true);
    this.errorMessage.set(null);

    const isEdit = this.isEditMode();
    const role = this.selectedRole();

    const payload = {
      code: this.roleForm.controls.code.value.toUpperCase(),
      nameAr: this.roleForm.controls.nameAr.value,
      descriptionAr: this.roleForm.controls.descriptionAr.value,
      isActive: true,
      permissionIds: isEdit && role ? role.permissionIds : []
    };

    try {
      let response;
      if (isEdit && role) {
        response = await this.apiService.apiFetch(`/api/roles/${role.id}`, {
          method: 'PUT',
          headers: this.apiService.headers,
          body: JSON.stringify(payload)
        });
      } else {
        response = await this.apiService.apiFetch('/api/roles', {
          method: 'POST',
          headers: this.apiService.headers,
          body: JSON.stringify(payload)
        });
      }

      const result = await response.json();

      if (!response.ok) {
        this.errorMessage.set(result.error || 'عذراً، فشل حفظ تفاصيل الدور الوظيفي.');
        this.isSubmittingForm.set(false);
        return;
      }

      this.successMessage.set(isEdit ? 'تم تحديث مسمى وتفاصيل المسمى الوظيفي بنجاح.' : 'تم إنشاء الدور الوظيفي الجديد بنجاح. يمكنك الآن تعيين مصفوفة الصلاحيات الخاصة به.');
      this.showRoleFormModal.set(false);
      await this.loadData();
    } catch (e) {
      console.error(e);
      this.errorMessage.set('حدث خطأ في الاتصال بالخادم أثناء عملية الحفظ.');
    } finally {
      this.isSubmittingForm.set(false);
    }
  }

  async deleteRole(role: RoleWithPermissions) {
    if (role.isSystem) return;
    if (!await this.confirmDialog.confirm({ title: 'حذف دور الأمان', message: `هل أنت متأكد من رغبتك في حذف دور الأمان "${role.nameAr}"؟ هذا الإجراء سيؤدي لإزالة الدور من جميع حسابات الموظفين المرتبطة به فوراً.`, variant: 'danger' })) return;

    this.errorMessage.set(null);
    try {
      const response = await this.apiService.apiFetch(`/api/roles/${role.id}`, {
        method: 'DELETE',
        headers: this.apiService.headers
      });

      if (response.ok) {
        this.successMessage.set(`تم حذف دور الأمان "${role.nameAr}" وكل ارتباطاته وتعييناته بنجاح.`);
        this.selectedRole.set(null);
        await this.loadData();
      } else {
        const err = await response.json();
        this.errorMessage.set(err.error || 'عذراً، لا يمكن إتمام حذف هذا الدور من النظام.');
      }
    } catch (e) {
      console.error(e);
      this.errorMessage.set('فشل الاتصال بالشبكة لحذف الدور.');
    }
  }
}
