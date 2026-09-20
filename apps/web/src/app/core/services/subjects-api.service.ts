import { Injectable, signal } from '@angular/core';
import { BaseApiService } from './base-api.service';
import { SubjectItem, TopicItem, SkillItem } from '../models/api.models';

@Injectable({
  providedIn: 'root',
})
export class SubjectsApiService extends BaseApiService {
  public subjects = signal<SubjectItem[]>([]);
  public topics = signal<TopicItem[]>([]);
  public skills = signal<SkillItem[]>([]);
  public error = signal('');

  private lookupItems<T>(data: any): T[] {
    if (Array.isArray(data)) return data as T[];
    if (Array.isArray(data?.items)) return data.items as T[];
    if (Array.isArray(data?.data)) return data.data as T[];
    return [];
  }

  async loadSubjects() {
    this.error.set('');
    try {
      const res = await this.apiFetch('/api/subjects', { headers: this.headers });
      if (res.ok) {
        const data = await res.json();
        this.subjects.set(this.lookupItems<SubjectItem>(data));
      } else this.error.set(await this.readApiError(res));
    } catch (e) {
      console.error('Failed to load subjects', e);
      this.error.set('تعذر تحميل المواد الدراسية.');
    }
  }

  async loadSubjectsForAcademicYear(academicYearId: string): Promise<SubjectItem[]> {
    const query = new URLSearchParams({ academicYearId }).toString();
    const res = await this.apiFetch(`/api/subjects?${query}`, { headers: this.headers });
    if (!res.ok) throw new Error(await this.readApiError(res));
    return this.lookupItems<SubjectItem>(await res.json());
  }

  async createSubject(subjectData: any) {
    this.error.set('');
    try {
      const res = await this.apiFetch('/api/subjects', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(subjectData),
      });
      if (res.ok) {
        await this.loadSubjects();
        return true;
      }
      this.error.set(await this.readApiError(res));
    } catch (e) {
      console.error('Failed to create subject', e);
      this.error.set('تعذر حفظ المادة الدراسية.');
    }
    return false;
  }

  async updateSubject(id: string, subjectData: any) {
    this.error.set('');
    try {
      const res = await this.apiFetch(`/api/subjects/${id}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(subjectData),
      });
      if (res.ok) {
        await this.loadSubjects();
        return true;
      }
      this.error.set(await this.readApiError(res));
    } catch (e) {
      console.error('Failed to update subject', e);
      this.error.set('تعذر تحديث المادة الدراسية.');
    }
    return false;
  }

  async deleteSubject(id: string) {
    this.error.set('');
    try {
      const res = await this.apiFetch(`/api/subjects/${id}`, {
        method: 'DELETE',
        headers: this.headers,
      });
      if (res.ok) {
        await this.loadSubjects();
        return true;
      }
      this.error.set(await this.readApiError(res));
    } catch (e) {
      console.error('Failed to delete subject', e);
      this.error.set('تعذر أرشفة المادة الدراسية.');
    }
    return false;
  }

  private async readApiError(res: Response): Promise<string> {
    const body = await res.json().catch(() => ({}));
    return typeof body?.error === 'string' ? body.error : `تعذر تنفيذ العملية (HTTP ${res.status}).`;
  }

  async loadTopics() {
    try {
      const res = await this.apiFetch('/api/topics', { headers: this.headers });
      if (res.ok) {
        const data = await res.json();
        this.topics.set(data);
      }
    } catch (e) {
      console.error('Failed to load topics', e);
    }
  }

  async createTopic(topicData: any) {
    try {
      const res = await this.apiFetch('/api/topics', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(topicData),
      });
      if (res.ok) {
        await this.loadTopics();
        return true;
      }
    } catch (e) {
      console.error('Failed to create topic', e);
    }
    return false;
  }

  async updateTopic(id: string, topicData: any) {
    try {
      const res = await this.apiFetch(`/api/topics/${id}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(topicData),
      });
      if (res.ok) {
        await this.loadTopics();
        return true;
      }
    } catch (e) {
      console.error('Failed to update topic', e);
    }
    return false;
  }

  async deleteTopic(id: string) {
    try {
      const res = await this.apiFetch(`/api/topics/${id}`, {
        method: 'DELETE',
        headers: this.headers,
      });
      if (res.ok) {
        await this.loadTopics();
        return true;
      }
    } catch (e) {
      console.error('Failed to delete topic', e);
    }
    return false;
  }

  async loadSkills() {
    try {
      const res = await this.apiFetch('/api/skills', { headers: this.headers });
      if (res.ok) {
        const data = await res.json();
        this.skills.set(data);
      }
    } catch (e) {
      console.error('Failed to load skills', e);
    }
  }

  async createSkill(skillData: any) {
    try {
      const res = await this.apiFetch('/api/skills', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(skillData),
      });
      if (res.ok) {
        await this.loadSkills();
        return true;
      }
    } catch (e) {
      console.error('Failed to create skill', e);
    }
    return false;
  }

  async updateSkill(id: string, skillData: any) {
    try {
      const res = await this.apiFetch(`/api/skills/${id}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(skillData),
      });
      if (res.ok) {
        await this.loadSkills();
        return true;
      }
    } catch (e) {
      console.error('Failed to update skill', e);
    }
    return false;
  }

  async deleteSkill(id: string) {
    try {
      const res = await this.apiFetch(`/api/skills/${id}`, {
        method: 'DELETE',
        headers: this.headers,
      });
      if (res.ok) {
        await this.loadSkills();
        return true;
      }
    } catch (e) {
      console.error('Failed to delete skill', e);
    }
    return false;
  }
}
