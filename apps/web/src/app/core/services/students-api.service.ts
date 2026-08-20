import { Injectable, signal } from '@angular/core';
import { BaseApiService } from './base-api.service';
import { Student } from '../models/api.models';

@Injectable({
  providedIn: 'root',
})
export class StudentsApiService extends BaseApiService {
  public students = signal<Student[]>([]);
  public studentsTotal = signal<number>(0);
  public enrollments = signal<any[]>([]);

  private apiErrorMessage(body: any, fallback: string): string {
    const error = body?.error ?? body?.message;
    if (typeof error === 'string' && error.trim()) return error;
    if (error && typeof error === 'object') {
      if (typeof error.message === 'string' && error.message.trim()) return error.message;
      if (typeof error.error === 'string' && error.error.trim()) return error.error;
      try { return JSON.stringify(error); } catch { return fallback; }
    }
    return fallback;
  }

  private async loadStudentsPage(search = '', page = 1, limit = 25): Promise<{ list: Student[]; total: number; totalPages: number }> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set('search', search);

    const res = await this.apiFetch(`/api/students?${params.toString()}`, { headers: this.headers });
    const data = await this.safeJson(res);
    if (!data) return { list: [], total: 0, totalPages: 0 };

    if (Array.isArray(data)) {
      return { list: data, total: data.length, totalPages: 1 };
    }

    return {
      list: Array.isArray(data.data) ? data.data : (Array.isArray(data.students) ? data.students : []),
      total: Number(data.pagination?.total ?? data.pagination?.totalItems ?? data.total ?? data.totalItems ?? data.data?.length ?? data.students?.length ?? 0),
      totalPages: Number(data.pagination?.totalPages ?? data.totalPages ?? 1),
    };
  }

  async loadStudents(search = '') {
    try {
      this.isLoading.set(true);
      const result = await this.loadStudentsPage(search);
      this.students.set(result.list);
      this.studentsTotal.set(result.total);
    } catch (e) {
      console.error('Failed to load students', e);
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadAllStudents(search = '') {
    try {
      this.isLoading.set(true);
      const pageSize = 100;
      const firstPage = await this.loadStudentsPage(search, 1, pageSize);
      const allStudents = [...firstPage.list];

      for (let page = 2; page <= firstPage.totalPages; page++) {
        const nextPage = await this.loadStudentsPage(search, page, pageSize);
        allStudents.push(...nextPage.list);
      }

      this.students.set(allStudents);
      this.studentsTotal.set(firstPage.total || allStudents.length);
    } catch (e) {
      console.error('Failed to load all students', e);
    } finally {
      this.isLoading.set(false);
    }
  }

  async createStudent(studentData: any) {
    try {
      const res = await this.apiFetch('/api/students', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(studentData),
      });
      if (res.ok) {
        await this.loadStudents();
        return true;
      }
    } catch (e) {
      console.error('Failed to create student', e);
    }
    return false;
  }

  async updateStudent(id: string, studentData: any) {
    try {
      const res = await this.apiFetch(`/api/students/${id}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(studentData),
      });
      if (res.ok) {
        await this.loadStudents();
        return true;
      }
    } catch (e) {
      console.error('Failed to update student', e);
    }
    return false;
  }

  async deleteStudent(id: string) {
    try {
      const res = await this.apiFetch(`/api/students/${id}`, {
        method: 'DELETE',
        headers: this.headers,
      });
      if (res.ok) {
        await this.loadStudents();
        return true;
      }
    } catch (e) {
      console.error('Failed to delete student', e);
    }
    return false;
  }

  async loadEnrollments() {
    try {
      this.isLoading.set(true);
      const res = await this.apiFetch('/api/student-enrollments', { headers: this.headers });
      if (res.ok) {
        const data = await res.json();
        this.enrollments.set(data);
      }
    } catch (e) {
      console.error('Failed to load enrollments', e);
    } finally {
      this.isLoading.set(false);
    }
  }


  async createEnrollment(data: any): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await this.apiFetch('/api/student-enrollments', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await this.loadEnrollments();
        return { success: true };
      } else {
        const errData = await res.json().catch(() => ({}));
        return { success: false, error: errData.error || 'Failed to create enrollment' };
      }
    } catch (e: any) {
      console.error('Failed to create enrollment', e);
      return { success: false, error: e.message || 'Failed to create enrollment' };
    }
  }

  async updateEnrollment(id: string, data: any): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await this.apiFetch(`/api/student-enrollments/${id}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await this.loadEnrollments();
        return { success: true };
      } else {
        const errData = await res.json().catch(() => ({}));
        const issueText = Array.isArray(errData.issues)
          ? errData.issues.map((issue: any) => `${issue.path || 'field'}: ${issue.message}`).join('، ')
          : '';
        return { success: false, error: issueText ? `${errData.error || 'Validation failed'}: ${issueText}` : (errData.error || 'Failed to update enrollment') };
      }
    } catch (e: any) {
      console.error('Failed to update enrollment', e);
      return { success: false, error: e.message || 'Failed to update enrollment' };
    }
  }

  async deleteEnrollment(id: string) {
    try {
      const res = await this.apiFetch(`/api/student-enrollments/${id}`, {
        method: 'DELETE',
        headers: this.headers,
      });
      if (res.ok) {
        await this.loadEnrollments();
        return true;
      }
    } catch (e) {
      console.error('Failed to delete enrollment', e);
    }
    return false;
  }
}
