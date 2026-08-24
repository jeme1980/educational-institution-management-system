import { Injectable, signal } from '@angular/core';
import { BaseApiService } from './base-api.service';
import { ExamItem } from '../models/api.models';

@Injectable({
  providedIn: 'root',
})
export class ExamsApiService extends BaseApiService {
  public exams = signal<ExamItem[]>([]);
  public examTypes = signal<any[]>([]);
  public examStatuses = signal<any[]>([]);
  public questionTypes = signal<any[]>([]);
  public error = signal('');
  public questionSaveError = signal('');
  public questionLoadError = signal('');

  private lookupItems(data: any): any[] {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.data)) return data.data;
    return [];
  }

  private async readError(res: Response): Promise<string> {
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return res.status === 404
        ? '…״³״§״± ״­״¸ ״§„״§…״×״­״§† ״÷״± …״×״§״­. ״£״¹״¯ ״×״´״÷„ ״®״§״¯… API ״«… ״­״¯‘״« ״§„״µ״­״©.'
        : `״×״¹״°״± ״×†״° ״§„״¹…„״© (HTTP ${res.status}).`;
    }
    try {
      const body = await res.json();
      const value = body?.error?.message ?? body?.error ?? body?.message;
      if (typeof value === 'string') return value;
      if (value && typeof value === 'object') return String(value.message || value.detail || `״×״¹״°״± ״×†״° ״§„״¹…„״© (HTTP ${res.status}).`);
    } catch { /* fallback below */ }
    return `״×״¹״°״± ״×†״° ״§„״¹…„״© (HTTP ${res.status}).`;
  }

  async loadExams() {
    this.error.set('');
    try {
      this.isLoading.set(true);
      const yearId = this.selectedAcademicYearId();
      const instId = this.selectedInstitutionId();
      const params = new URLSearchParams();
      if (instId) params.append('institutionId', instId);
      if (yearId) params.append('academicYearId', yearId);
      const queryString = params.toString();
      const url = queryString ? `/api/exams?${queryString}` : '/api/exams';

      const res = await this.apiFetch(url, { headers: this.headers });
      if (res.ok) {
        const data = await res.json();
        this.exams.set(data);
      } else this.error.set(await this.readError(res));
    } catch (e) {
      console.error('Failed to load exams', e);
    } finally {
      this.isLoading.set(false);
    }
  }

  async createExam(examData: any): Promise<any> {
    this.error.set('');
    try {
      const yearId = this.selectedAcademicYearId();
      const payload = {
        academicYearId: yearId,
        ...examData,
      };
      const res = await this.apiFetch('/api/exams', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const created = await res.json();
        await this.loadExams();
        return created;
      }
      this.error.set(await this.readError(res));
    } catch (e) {
      console.error('Failed to create exam', e);
    }
    return null;
  }

  async updateExam(id: string, examData: any) {
    this.error.set('');
    try {
      const res = await this.apiFetch(`/api/exams/${id}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(examData),
      });
      if (res.ok) {
        await this.loadExams();
        return true;
      }
      this.error.set(await this.readError(res));
    } catch (e) {
      console.error('Failed to update exam', e);
    }
    return false;
  }

  async loadExam(id: string): Promise<any | null> {
    try {
      const res = await this.apiFetch(`/api/exams/${id}`, { headers: this.headers });
      if (res.ok) return await res.json();
      this.error.set(await this.readError(res));
    } catch (error) { console.error('Failed to load exam', error); }
    return null;
  }

  async saveExamBuilder(id: string, payload: any): Promise<any | null> {
    this.error.set(''); this.questionSaveError.set('');
    try {
      const res = await this.apiFetch(`/api/exams/${id}/builder`, { method: 'PUT', headers: this.headers, body: JSON.stringify(payload) });
      if (res.ok) { const saved = await res.json(); await this.loadExams(); return saved; }
      const message = await this.readError(res); this.error.set(message); this.questionSaveError.set(message);
    } catch (error) { console.error('Failed to save exam builder', error); this.error.set('״×״¹״°״± ״§„״§״×״µ״§„ ״¨״§„״®״§״¯… ״£״«†״§״¡ ״­״¸ ״§„״§…״×״­״§†.'); this.questionSaveError.set(this.error()); }
    return null;
  }

  async deleteExam(id: string) {
    this.error.set('');
    try {
      const res = await this.apiFetch(`/api/exams/${id}`, {
        method: 'DELETE',
        headers: this.headers,
      });
      if (res.ok) {
        await this.loadExams();
        return true;
      }
      this.error.set(await this.readError(res));
    } catch (e) {
      console.error('Failed to delete exam', e);
    }
    return false;
  }


  async loadExamResults(examId: string) {
    try {
      const res = await this.apiFetch(`/api/exams/${examId}/results`, { headers: this.headers });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.error('Failed to load exam results', e);
    }
    return null;
  }

  async loadExamAnalysis(examId: string) {
    try {
      const res = await this.apiFetch(`/api/exams/${examId}/analysis`, { headers: this.headers });
      if (res.ok) return await res.json();
    } catch (e) {
      console.error('Failed to load exam analysis', e);
    }
    return null;
  }

  async loadProgressTracking(params: { academicYearId: string; subjectId: string; studyGroupId: string }) {
    try {
      const query = new URLSearchParams(params).toString();
      const res = await this.apiFetch(`/api/progress-tracking?${query}`, { headers: this.headers });
      if (res.ok) return await res.json();
    } catch (e) { console.error('Failed to load progress tracking', e); }
    return null;
  }

  async loadProgressTrackingStudyGroups(params: { academicYearId: string; subjectId: string }) {
    try {
      const query = new URLSearchParams(params).toString();
      const res = await this.apiFetch(`/api/progress-tracking/study-groups?${query}`, { headers: this.headers });
      if (res.ok) return await res.json();
    } catch (e) { console.error('Failed to load progress tracking study groups', e); }
    return [];
  }

  async loadStudentProgressTracking(params: { academicYearId: string; subjectId: string; studyGroupId: string; studentId: string }) {
    try {
      const query = new URLSearchParams(params).toString();
      const res = await this.apiFetch(`/api/progress-tracking/student?${query}`, { headers: this.headers });
      if (res.ok) return await res.json();
    } catch (e) { console.error('Failed to load student progress tracking', e); }
    return null;
  }

  async saveExamResults(examId: string, results: any[]) {
    try {
      const res = await this.apiFetch(`/api/exams/${examId}/results`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ results }),
      });
      if (res.ok) {
        return true;
      }
    } catch (e) {
      console.error('Failed to save exam results', e);
    }
    return false;
  }

  async importExamResults(examId: string, file: File): Promise<{ ok: boolean; data?: any }> {
    try {
      const headers = { ...this.headers };
      delete headers['Content-Type'];
      const res = await this.apiFetch(`/api/exams/${examId}/results/import`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, body: file });
      return { ok: res.ok, data: await res.json().catch(() => null) };
    } catch (error) { console.error('Failed to import exam results', error); return { ok: false }; }
  }

  async loadExamTypes() {
    try {
      const res = await this.apiFetch('/api/exam-types', { headers: this.headers });
      if (res.ok) {
        const data = await res.json();
        this.examTypes.set(this.lookupItems(data));
      }
    } catch (e) {
      console.error('Failed to load exam types', e);
    }
  }

  async createExamType(data: any) {
    try {
      const res = await this.apiFetch('/api/exam-types', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await this.loadExamTypes();
        return true;
      }
    } catch (e) {
      console.error('Failed to create exam type', e);
    }
    return false;
  }

  async updateExamType(id: string, data: any) {
    try {
      const res = await this.apiFetch(`/api/exam-types/${id}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await this.loadExamTypes();
        return true;
      }
    } catch (e) {
      console.error('Failed to update exam type', e);
    }
    return false;
  }

  async deleteExamType(id: string) {
    try {
      const res = await this.apiFetch(`/api/exam-types/${id}`, {
        method: 'DELETE',
        headers: this.headers,
      });
      if (res.ok) {
        await this.loadExamTypes();
        return true;
      }
    } catch (e) {
      console.error('Failed to delete exam type', e);
    }
    return false;
  }

  async loadExamStatuses() {
    try {
      const res = await this.apiFetch('/api/exam-statuses', { headers: this.headers });
      if (res.ok) {
        const data = await res.json();
        this.examStatuses.set(data);
      }
    } catch (e) {
      console.error('Failed to load exam statuses', e);
    }
  }

  async loadQuestionTypes() {
    try {
      const res = await this.apiFetch('/api/question-types', { headers: this.headers });
      if (res.ok) {
        const data = await res.json();
        this.questionTypes.set(this.lookupItems(data));
      }
    } catch (e) {
      console.error('Failed to load question types', e);
    }
  }

  async createQuestionType(data: any) {
    try {
      const res = await this.apiFetch('/api/question-types', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await this.loadQuestionTypes();
        return true;
      }
    } catch (e) {
      console.error('Failed to create question type', e);
    }
    return false;
  }

  async updateQuestionType(id: string, data: any) {
    try {
      const res = await this.apiFetch(`/api/question-types/${id}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await this.loadQuestionTypes();
        return true;
      }
    } catch (e) {
      console.error('Failed to update question type', e);
    }
    return false;
  }

  async deleteQuestionType(id: string) {
    try {
      const res = await this.apiFetch(`/api/question-types/${id}`, {
        method: 'DELETE',
        headers: this.headers,
      });
      if (res.ok) {
        await this.loadQuestionTypes();
        return true;
      }
    } catch (e) {
      console.error('Failed to delete question type', e);
    }
    return false;
  }

  async loadExamQuestions(examId: string) {
    this.questionLoadError.set('');
    try {
      const res = await this.apiFetch(`/api/exams/${examId}/questions`, { headers: this.headers });
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data) ? data : (Array.isArray(data?.questions) ? data.questions : []);
      }
      const body = await res.json().catch(() => null);
      this.questionLoadError.set(body?.error?.message || body?.error || `״×״¹״°״± ״×״­…„ ״£״³״¦„״© ״§„״§…״×״­״§† (HTTP ${res.status}).`);
    } catch (e) {
      console.error('Failed to load exam questions', e);
      this.questionLoadError.set('״×״¹״°״± ״§„״§״×״µ״§„ ״¨״§„״®״§״¯… ״£״«†״§״¡ ״×״­…„ ״£״³״¦„״© ״§„״§…״×״­״§†.');
    }
    return [];
  }

  async loadExamQuestionContext(examId: string) {
    try {
      const res = await this.apiFetch(`/api/exams/${examId}/question-context`, { headers: this.headers });
      if (res.ok) return await res.json();
      return { topics: [], skills: [], gradeLevels: [], warning: `״×״¹״°״± ״×״­…„ ״³״§‚ ״£״³״¦„״© ״§„״§…״×״­״§† (HTTP ${res.status}). ״£״¹״¯ ״×״´״÷„ ״®״§״¯… ״§„€ API ״«… ״­״§ˆ„ …״±״© ״£״®״±‰.` };
    } catch (e) {
      console.error('Failed to load exam question context', e);
      return { topics: [], skills: [], gradeLevels: [], warning: '״×״¹״°״± ״§„״§״×״µ״§„ ״¨״®״§״¯… ״£״³״¦„״© ״§„״§…״×״­״§†.' };
    }
  }

  async saveExamQuestions(examId: string, questions: any[]) {
    this.questionSaveError.set('');
    try {
      const res = await this.apiFetch(`/api/exams/${examId}/questions`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ questions }),
      });
      if (res.ok) return true;
      const body = await res.json().catch(() => null);
      this.questionSaveError.set(body?.error?.message || body?.error || `״×״¹״°״± ״­״¸ ״§„״£״³״¦„״© (HTTP ${res.status}).`);
    } catch (e) {
      console.error('Failed to save exam questions', e);
      this.questionSaveError.set('״×״¹״°״± ״§„״§״×״µ״§„ ״¨״§„״®״§״¯… ״£״«†״§״¡ ״­״¸ ״§„״£״³״¦„״©.');
    }
    return false;
  }

  async loadExamStudyGroups(examId: string) {
    try {
      const res = await this.apiFetch(`/api/exams/${examId}/study-groups`, { headers: this.headers });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.error('Failed to load exam study groups', e);
    }
    return [];
  }

  async saveExamStudyGroups(examId: string, studyGroupIds: string[]) {
    try {
      const res = await this.apiFetch(`/api/exams/${examId}/study-groups`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ studyGroupIds }),
      });
      return res.ok;
    } catch (e) {
      console.error('Failed to save exam study groups', e);
    }
    return false;
  }

  async loadGroupExamResults(examId: string, studyGroupId: string) {
    try {
      const res = await this.apiFetch(`/api/exams/${examId}/study-groups/${studyGroupId}/results`, { headers: this.headers });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.error('Failed to load group exam results', e);
    }
    return null;
  }

  async saveGroupExamResults(examId: string, studyGroupId: string, examStudyGroupId: string, results: any[]) {
    try {
      const res = await this.apiFetch(`/api/exams/${examId}/study-groups/${studyGroupId}/results`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ examStudyGroupId, results }),
      });
      return res.ok;
    } catch (e) {
      console.error('Failed to save group exam results', e);
    }
    return false;
  }
}
