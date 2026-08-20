import { Injectable, signal } from '@angular/core';
import { BaseApiService } from './base-api.service';
import { StaffMember, JobRole, StaffAssignment, StaffDevelopment } from '../models/api.models';

@Injectable({
  providedIn: 'root',
})
export class UsersApiService extends BaseApiService {
  public staff = signal<StaffMember[]>([]);
  public jobRoles = signal<JobRole[]>([]);
  public staffAssignments = signal<StaffAssignment[]>([]);
  public staffDevelopments = signal<StaffDevelopment[]>([]);
  public staffDevelopmentError = signal<string>('');
  public staffAssignmentError = signal<string>('');
  public jobRoleError = signal<string>('');
  public staffError = signal<string>('');

  private errorMessage(body: any, fallback: string): string {
    const value = body?.error ?? body?.message ?? body;
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
      return String(value.message || value.error || value.detail || fallback);
    }
    return fallback;
  }

  async loadStaff() {
    try {
      const res = await this.apiFetch('/api/staff', { headers: this.headers });
      if (res.ok) {
        const data = await res.json();
        this.staff.set(data);
      }
    } catch (e) {
      console.error('Failed to load staff', e);
    }
  }

  async createStaff(staffData: any) {
    this.staffError.set('');
    try {
      const res = await this.apiFetch('/api/staff', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(staffData),
      });
      if (res.ok) {
        await this.loadStaff();
        return true;
      }
      this.staffError.set(await this.readStaffError(res));
    } catch (e) {
      console.error('Failed to create staff', e);
      this.staffError.set('تعذر الاتصال بالخادم أثناء حفظ بيانات الموظف.');
    }
    return false;
  }

  async updateStaff(id: string, staffData: any) {
    this.staffError.set('');
    try {
      const res = await this.apiFetch(`/api/staff/${id}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(staffData),
      });
      if (res.ok) {
        await this.loadStaff();
        return true;
      }
      this.staffError.set(await this.readStaffError(res));
    } catch (e) {
      console.error('Failed to update staff', e);
      this.staffError.set('تعذر الاتصال بالخادم أثناء تحديث بيانات الموظف.');
    }
    return false;
  }

  private async readStaffError(res: Response): Promise<string> {
    try {
      const body = await res.json();
      return typeof body?.error === 'string' ? body.error : body?.error?.message || `تعذر حفظ البيانات (HTTP ${res.status}).`;
    } catch {
      return `تعذر حفظ البيانات (HTTP ${res.status}).`;
    }
  }

  async deleteStaff(id: string) {
    try {
      const res = await this.apiFetch(`/api/staff/${id}`, {
        method: 'DELETE',
        headers: this.headers,
      });
      if (res.ok) {
        await this.loadStaff();
        return true;
      }
    } catch (e) {
      console.error('Failed to delete staff', e);
    }
    return false;
  }

  async loadStaffDevelopments() {
    try {
      const res = await this.apiFetch('/api/staff-developments', { headers: this.headers });
      if (res.ok) this.staffDevelopments.set(await res.json());
    } catch (e) { console.error('Failed to load staff developments', e); }
  }

  async createStaffDevelopment(data: Partial<StaffDevelopment>) {
    return this.saveStaffDevelopment('/api/staff-developments', 'POST', data);
  }

  async updateStaffDevelopment(id: string, data: Partial<StaffDevelopment>) {
    return this.saveStaffDevelopment(`/api/staff-developments/${id}`, 'PUT', data);
  }

  private async saveStaffDevelopment(url: string, method: string, data: Partial<StaffDevelopment>): Promise<boolean> {
    this.staffDevelopmentError.set('');
    try {
      const res = await this.apiFetch(url, { method, headers: this.headers, body: JSON.stringify(data) });
      if (res.ok) { await this.loadStaffDevelopments(); return true; }
      const body = await res.json().catch(() => ({}));
      this.staffDevelopmentError.set(body?.error || 'تعذر حفظ سجل الاستكمال.');
    } catch { this.staffDevelopmentError.set('تعذر الاتصال بالخادم.'); }
    return false;
  }

  async deleteStaffDevelopment(id: string): Promise<boolean> {
    try {
      const res = await this.apiFetch(`/api/staff-developments/${id}`, { method: 'DELETE', headers: this.headers });
      if (res.ok) { await this.loadStaffDevelopments(); return true; }
    } catch (e) { console.error('Failed to delete staff development', e); }
    return false;
  }

  async loadJobRoles() {
    try {
      const res = await this.apiFetch('/api/job-roles', { headers: this.headers });
      if (res.ok) {
        const data = await res.json();
        this.jobRoles.set(data);
      }
    } catch (e) {
      console.error('Failed to load job roles', e);
    }
  }

  async createJobRole(jobRoleData: any) {
    this.jobRoleError.set('');
    try {
      const res = await this.apiFetch('/api/job-roles', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(jobRoleData),
      });
      if (res.ok) {
        await this.loadJobRoles();
        return true;
      }
      const error = await res.json().catch(() => null);
      this.jobRoleError.set(this.errorMessage(error, `تعذر حفظ المسمى الوظيفي (HTTP ${res.status}).`));
      console.error('Failed to create job role:', res.status, error);
    } catch (e) {
      console.error('Failed to create job role', e);
    }
    return false;
  }

  async updateJobRole(id: string, jobRoleData: any) {
    this.jobRoleError.set('');
    try {
      const res = await this.apiFetch(`/api/job-roles/${id}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(jobRoleData),
      });
      if (res.ok) {
        await this.loadJobRoles();
        return true;
      }
      const error = await res.json().catch(() => null);
      this.jobRoleError.set(this.errorMessage(error, `تعذر حفظ المسمى الوظيفي (HTTP ${res.status}).`));
      console.error('Failed to update job role:', res.status, error);
    } catch (e) {
      console.error('Failed to update job role', e);
    }
    return false;
  }

  async deleteJobRole(id: string) {
    try {
      const res = await this.apiFetch(`/api/job-roles/${id}`, {
        method: 'DELETE',
        headers: this.headers,
      });
      if (res.ok) {
        await this.loadJobRoles();
        return true;
      }
    } catch (e) {
      console.error('Failed to delete job role', e);
    }
    return false;
  }

  async loadStaffAssignments() {
    try {
      const res = await this.apiFetch('/api/staff-assignments', { headers: this.headers });
      if (res.ok) {
        const data = await res.json();
        this.staffAssignments.set(data);
      }
    } catch (e) {
      console.error('Failed to load staff assignments', e);
    }
  }

  async createStaffAssignment(data: any) {
    this.staffAssignmentError.set('');
    try {
      const res = await this.apiFetch('/api/staff-assignments', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await this.loadStaffAssignments();
        return true;
      }
      const body = await res.json().catch(() => ({}));
      this.staffAssignmentError.set(body?.error === 'This staff member is already assigned for the selected institution and academic year.' ? 'هذا الموظف لديه تعيين مسجل مسبقًا في السنة الدراسية المختارة.' : body?.error || `تعذر حفظ التعيين (HTTP ${res.status}).`);
    } catch (e) {
      console.error('Failed to create staff assignment', e);
      this.staffAssignmentError.set('تعذر الاتصال بالخادم أثناء حفظ التعيين.');
    }
    return false;
  }

  async updateStaffAssignment(id: string, data: any) {
    this.staffAssignmentError.set('');
    try {
      const res = await this.apiFetch(`/api/staff-assignments/${id}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await this.loadStaffAssignments();
        return true;
      }
      const body = await res.json().catch(() => ({}));
      this.staffAssignmentError.set(body?.error === 'This staff member is already assigned for the selected institution and academic year.' ? 'هذا الموظف لديه تعيين مسجل مسبقًا في السنة الدراسية المختارة.' : body?.error || `تعذر تحديث التعيين (HTTP ${res.status}).`);
    } catch (e) {
      console.error('Failed to update staff assignment', e);
      this.staffAssignmentError.set('تعذر الاتصال بالخادم أثناء تحديث التعيين.');
    }
    return false;
  }

  async deleteStaffAssignment(id: string) {
    try {
      const res = await this.apiFetch(`/api/staff-assignments/${id}`, {
        method: 'DELETE',
        headers: this.headers,
      });
      if (res.ok) {
        await this.loadStaffAssignments();
        return true;
      }
    } catch (e) {
      console.error('Failed to delete staff assignment', e);
    }
    return false;
  }
}
