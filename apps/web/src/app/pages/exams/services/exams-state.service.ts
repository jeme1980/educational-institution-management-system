import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../../core/services/api.service';

@Injectable({ providedIn: 'root' })
export class ExamsStateService {
  private apiService = inject(ApiService);

  exams = this.apiService.exams;
  subjects = this.apiService.subjects;
  classes = this.apiService.classes;
  studyGroups = this.apiService.studyGroups;

  async loadExams() {
    return this.apiService.loadExams();
  }

  async createExam(data: any) {
    return this.apiService.createExam(data);
  }

  async updateExam(id: string, data: any) {
    return this.apiService.updateExam(id, data);
  }

  async deleteExam(id: string) {
    return this.apiService.deleteExam(id);
  }

  loadStudyGroups() { return this.apiService.loadStudyGroups(); }
  loadExamQuestions(id: string) { return this.apiService.loadExamQuestions(id); }
  saveExamQuestions(id: string, questions: any[]) { return this.apiService.saveExamQuestions(id, questions); }
  loadExamStudyGroups(id: string) { return this.apiService.loadExamStudyGroups(id); }
  saveExamStudyGroups(id: string, ids: string[]) { return this.apiService.saveExamStudyGroups(id, ids); }
}
