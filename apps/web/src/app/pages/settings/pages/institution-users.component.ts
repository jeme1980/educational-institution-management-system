import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, Validators, FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { InstitutionUserExpanded } from '../models/settings.model';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-institution-users',
  imports: [CommonModule, ReactiveFormsModule, FormsModule, MatIconModule, RouterLink],
  templateUrl: './institution-users.component.html',
  styleUrl: './institution-users.component.css'
})
export class InstitutionUsersComponent implements OnInit {
  private apiService = inject(ApiService);

  // Lists & data signals
  users = signal<InstitutionUserExpanded[]>([]);
  unregisteredStaff = signal<any[]>([]);
  availableRoles = signal<any[]>([]);

  // States
  isLoading = signal<boolean>(true);
  isSubmittingForm = signal<boolean>(false);
  successMessage = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  // Modal displays
  showCreateModal = signal<boolean>(false);
  showSetupModal = signal<boolean>(false);
  showEditRolesModal = signal<boolean>(false);
  selectedUser = signal<InstitutionUserExpanded | null>(null);

  // Forms
  userForm = new FormGroup({
    staffMemberId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] })
  });

  // Checkbox creation array state
  selectedRoleIds = new Set<string>();

  // Edit Roles selection array state
  editSelectedRoleIds = new Set<string>();

  ngOnInit() {
    this.loadData();
  }

  async loadData() {
    this.isLoading.set(true);
    try {
      // 1. Fetch Users List
      const usersRes = await this.apiService.apiFetch('/api/institution-users');
      if (usersRes.ok) {
        this.users.set(await usersRes.json());
      }

      // 2. Fetch Roles list
      const rolesRes = await this.apiService.apiFetch('/api/roles');
      if (rolesRes.ok) {
        this.availableRoles.set(await rolesRes.json());
      }

      // 3. Fetch unregistered staff list
      const staffRes = await this.apiService.apiFetch('/api/staff-members/unregistered');
      if (staffRes.ok) {
        this.unregisteredStaff.set(await staffRes.json());
      }
    } catch (e) {
      console.error(e);
      this.errorMessage.set('فشل الاتصال بخادم قاعدة البيانات. يرجى مراجعة إعدادات التشغيل.');
    } finally {
      this.isLoading.set(false);
    }
  }

  openCreateModal() {
    this.selectedRoleIds.clear();
    this.userForm.reset({ staffMemberId: '', email: '' });
    this.showCreateModal.set(true);
  }

  onRoleCheckboxChange(event: any, roleId: string) {
    if (event.target.checked) {
      this.selectedRoleIds.add(roleId);
    } else {
      this.selectedRoleIds.delete(roleId);
    }
  }

  async createUser() {
    if (this.userForm.invalid) return;
    this.isSubmittingForm.set(true);
    this.errorMessage.set(null);

    const payload = {
      staffMemberId: this.userForm.controls.staffMemberId.value,
      email: this.userForm.controls.email.value,
      roleIds: Array.from(this.selectedRoleIds)
    };

    try {
      const response = await this.apiService.apiFetch('/api/institution-users', {
        method: 'POST',
        headers: this.apiService.headers,
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        this.errorMessage.set(result.error || 'فشل رصد وإنشاء حساب مستخدم جديد.');
        this.isSubmittingForm.set(false);
        return;
      }

      this.successMessage.set(result.setup?.setupUrl
        ? `تم إنشاء الحساب بانتظار الإعداد. رابط التطوير: ${result.setup.setupUrl}`
        : 'تم إنشاء الحساب بانتظار إعداد كلمة المرور.');
      this.showCreateModal.set(false);
      await this.loadData();
    } catch (e) {
      console.error(e);
      this.errorMessage.set('حدث خطأ في الاتصال أثناء حفظ البيانات.');
    } finally {
      this.isSubmittingForm.set(false);
    }
  }

  async toggleUserActive(user: InstitutionUserExpanded) {
    const newActiveState = !user.isActive;
    try {
      const response = await this.apiService.apiFetch(`/api/institution-users/${user.id}`, {
        method: 'PATCH',
        headers: this.apiService.headers,
        body: JSON.stringify({ isActive: newActiveState })
      });

      if (response.ok) {
        this.successMessage.set(`تم تغيير حالة الحساب للمستخدم ${user.user?.displayName || ''} بنجاح.`);
        await this.loadData();
      } else {
        const errorData = await response.json();
        this.errorMessage.set(errorData.error || 'عذراً، فشل تحديث حالة النشاط للحساب.');
      }
    } catch (e) {
      console.error(e);
      this.errorMessage.set('حدث خطأ في الشبكة أثناء محاولة تعديل حالة الحساب.');
    }
  }

  openReissueSetupModal(user: InstitutionUserExpanded) {
    this.selectedUser.set(user);
    this.showSetupModal.set(true);
  }

  async reissueSetup() {
    const user = this.selectedUser();
    if (!user) return;
    this.isSubmittingForm.set(true);

    try {
      const response = await this.apiService.apiFetch(`/api/institution-users/${user.id}/account-setup/reissue`, {
        method: 'POST',
        headers: this.apiService.headers,
      });
      const result = await response.json().catch(() => ({}));

      if (response.ok) {
        this.successMessage.set(result.setup?.setupUrl
          ? `تم إصدار رابط إعداد جديد. رابط التطوير: ${result.setup.setupUrl}`
          : 'تم إصدار رابط إعداد جديد بنجاح.');
        this.showSetupModal.set(false);
        await this.loadData();
      } else {
        const err = result;
        this.errorMessage.set(err.error || 'تعذر إصدار رابط إعداد جديد.');
      }
    } catch (e) {
      console.error(e);
      this.errorMessage.set('تعذر الاتصال بالخادم لإصدار رابط الإعداد.');
    } finally {
      this.isSubmittingForm.set(false);
    }
  }

  accountStatusLabel(status?: InstitutionUserExpanded['accountStatus']): string {
    if (status === 'PENDING_SETUP') return 'بانتظار إعداد الحساب';
    if (status === 'SETUP_EXPIRED') return 'انتهت صلاحية رابط الإعداد';
    if (status === 'DISABLED') return 'معطّل';
    return 'نشط';
  }

  openEditRolesModal(user: InstitutionUserExpanded) {
    this.selectedUser.set(user);
    this.editSelectedRoleIds.clear();
    (user as any).roles?.forEach((r: any) => this.editSelectedRoleIds.add(r.roleId));
    this.showEditRolesModal.set(true);
  }

  isRoleAssigned(roleId: string): boolean {
    return this.editSelectedRoleIds.has(roleId);
  }

  onEditRoleCheckboxChange(event: any, roleId: string) {
    if (event.target.checked) {
      this.editSelectedRoleIds.add(roleId);
    } else {
      this.editSelectedRoleIds.delete(roleId);
    }
  }

  async updateUserRoles() {
    const user = this.selectedUser();
    if (!user) return;

    try {
      const response = await this.apiService.apiFetch(`/api/institution-users/${user.id}`, {
        method: 'PATCH',
        headers: this.apiService.headers,
        body: JSON.stringify({ roleIds: Array.from(this.editSelectedRoleIds) })
      });

      if (response.ok) {
        this.successMessage.set(`تم تحديث الأدوار والصلاحيات بنجاح للمستخدم ${user.user?.displayName || ''}.`);
        this.showEditRolesModal.set(false);
        await this.loadData();
      } else {
        const err = await response.json();
        this.errorMessage.set(err.error || 'فشل تحديث الأدوار المعينة.');
      }
    } catch (e) {
      console.error(e);
      this.errorMessage.set('فشل الاتصال لتحديث الأدوار.');
    }
  }
}
