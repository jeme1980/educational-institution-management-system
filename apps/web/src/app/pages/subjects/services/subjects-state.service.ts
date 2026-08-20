import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../../core/services/api.service';

@Injectable({ providedIn: 'root' })
export class SubjectsStateService {
  private apiService = inject(ApiService);

  subjects = this.apiService.subjects;
  topics = this.apiService.topics;
  skills = this.apiService.skills;

  async loadSubjects() {
    return this.apiService.loadSubjects();
  }

  async loadTopics() {
    return this.apiService.loadTopics();
  }

  async loadSkills() {
    return this.apiService.loadSkills();
  }
}
