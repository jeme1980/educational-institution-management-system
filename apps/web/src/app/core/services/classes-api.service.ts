import { Injectable, signal } from '@angular/core';
import { BaseApiService } from './base-api.service';
import { ClassFormValue, ClassItem } from '../models/api.models';
import { StudyGroupItem } from '../../pages/study-groups/models/study-group.model';

@Injectable({
  providedIn: 'root',
})
export class ClassesApiService extends BaseApiService {
  public classes = signal<ClassItem[]>([]);
  public studyGroups = signal<StudyGroupItem[]>([]);
  public studyGroupError = signal('');
  public lastError = signal('');

  async loadClasses() {
    try {
      const res = await this.apiFetch('/api/classes', { headers: this.headers });
      if (res.ok) {
        const data = await res.json();
        this.classes.set((data || []).map((classItem: any) => ({
          ...classItem,
          // Keep the computed API field explicit in the application model.
          classCode: classItem.classCode || null,
          gradeLevel: classItem.gradeLevel?.nameAr || '',
          gradeLevelInfo: classItem.gradeLevel || null,
        })));
      }
    } catch (e) {
      console.error('Failed to load classes', e);
    }
  }

  async createClass(classData: ClassFormValue) {
    this.lastError.set('');
    try {
      let res = await this.apiFetch('/api/classes', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(classData),
      });
      if (res.status === 401 && await this.authService.refreshSession()) {
        res = await this.apiFetch('/api/classes', { method: 'POST', headers: this.headers, body: JSON.stringify(classData) });
      }
      if (res.ok) {
        await this.loadClasses();
        return true;
      }
      this.lastError.set(await this.readError(res));
    } catch (e) {
      console.error('Failed to create class', e);
      this.lastError.set('تعذر الاتصال بالخادم.');
    }
    return false;
  }

  async updateClass(id: string, classData: ClassFormValue) {
    this.lastError.set('');
    try {
      let res = await this.apiFetch(`/api/classes/${id}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(classData),
      });
      if (res.status === 401 && await this.authService.refreshSession()) {
        res = await this.apiFetch(`/api/classes/${id}`, { method: 'PUT', headers: this.headers, body: JSON.stringify(classData) });
      }
      if (res.ok) {
        await this.loadClasses();
        return true;
      }
      this.lastError.set(await this.readError(res));
    } catch (e) {
      console.error('Failed to update class', e);
      this.lastError.set('تعذر الاتصال بالخادم.');
    }
    return false;
  }

  async deleteClass(id: string) {
    this.lastError.set('');
    try {
      let res = await this.apiFetch(`/api/classes/${id}`, {
        method: 'DELETE',
        headers: this.headers,
      });
      if (res.status === 401 && await this.authService.refreshSession()) {
        res = await this.apiFetch(`/api/classes/${id}`, { method: 'DELETE', headers: this.headers });
      }
      if (res.ok) {
        await this.loadClasses();
        return true;
      }
      this.lastError.set(await this.readError(res));
    } catch (e) {
      console.error('Failed to delete class', e);
      this.lastError.set('تعذر الاتصال بالخادم.');
    }
    return false;
  }

  private async readError(res: Response): Promise<string> {
    try {
      const body = await res.json();
      return body?.error?.message || body?.error || 'تعذر تنفيذ العملية.';
    } catch {
      return `تعذر تنفيذ العملية (HTTP ${res.status}).`;
    }
  }

  async loadStudyGroups(includeArchived = false) {
    this.studyGroupError.set('');
    try {
      this.isLoading.set(true);
      const res = await this.apiFetch(`/api/study-groups${includeArchived ? '?includeArchived=true' : ''}`);
      if (res.ok) {
        const data = await res.json();
        this.studyGroups.set(data || []);
      } else {
        this.studyGroupError.set(await this.readError(res));
      }
    } catch (e) {
      console.error('Failed to load study groups', e);
    } finally {
      this.isLoading.set(false);
    }
  }

  async createStudyGroup(data: any) {
    this.studyGroupError.set('');
    try {
      const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
      const payload = {
        ...data,
        classId: isUuid(data?.classId) ? data.classId : null,
        subjectId: isUuid(data?.subjectId) ? data.subjectId : null,
        staffAssignmentId: isUuid(data?.staffAssignmentId) ? data.staffAssignmentId : null,
      };
      let res = await this.apiFetch('/api/study-groups', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
      });
      if (res.status === 401 && await this.authService.refreshSession()) {
        res = await this.apiFetch('/api/study-groups', {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(payload),
        });
      }
      if (res.ok) {
        await this.loadStudyGroups();
        return true;
      }
      this.studyGroupError.set(await this.readError(res));
    } catch (e) {
      console.error('Failed to create study group', e);
      this.studyGroupError.set('تعذر الاتصال بالخادم أثناء حفظ مجموعة التعلم.');
    }
    return false;
  }

  async updateStudyGroup(id: string, data: any) {
    this.studyGroupError.set('');
    try {
      const res = await this.apiFetch(`/api/study-groups/${id}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await this.loadStudyGroups();
        return true;
      }
      this.studyGroupError.set(await this.readError(res));
    } catch (e) {
      console.error('Failed to update study group', e);
    }
    return false;
  }

  async deleteStudyGroup(id: string) {
    this.studyGroupError.set('');
    try {
      const res = await this.apiFetch(`/api/study-groups/${id}`, {
        method: 'DELETE',
        headers: this.headers,
      });
      if (res.ok) {
        await this.loadStudyGroups();
        return true;
      }
      this.studyGroupError.set(await this.readError(res));
    } catch (e) {
      console.error('Failed to delete study group', e);
    }
    return false;
  }

  async restoreStudyGroup(id: string) {
    this.studyGroupError.set('');
    try {
      let res = await this.apiFetch(`/api/study-groups/${id}/restore`, { method: 'PATCH', headers: this.headers });
      if (res.status === 401 && await this.authService.refreshSession()) {
        res = await this.apiFetch(`/api/study-groups/${id}/restore`, { method: 'PATCH', headers: this.headers });
      }
      if (res.ok) {
        await this.loadStudyGroups(true);
        return true;
      }
      this.studyGroupError.set(await this.readError(res));
    } catch (e) {
      console.error('Failed to restore study group', e);
      this.studyGroupError.set('تعذر استعادة مجموعة التعلم.');
    }
    return false;
  }

  async loadGroupMembers(groupId: string): Promise<any[]> {
    try {
      const res = await this.apiFetch(`/api/study-groups/${groupId}/members`);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.error('Failed to load group members', e);
    }
    return [];
  }

  async addGroupMember(groupId: string, enrollmentId: string): Promise<boolean> {
    try {
      const res = await this.apiFetch(`/api/study-groups/${groupId}/members`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ enrollmentId }),
      });
      return res.ok;
    } catch (e) {
      console.error('Failed to add group member', e);
    }
    return false;
  }

  async removeGroupMember(groupId: string, memberId: string): Promise<boolean> {
    try {
      const res = await this.apiFetch(`/api/study-groups/${groupId}/members/${memberId}`, {
        method: 'DELETE',
        headers: this.headers,
      });
      return res.ok;
    } catch (e) {
      console.error('Failed to remove group member', e);
    }
    return false;
  }
}
