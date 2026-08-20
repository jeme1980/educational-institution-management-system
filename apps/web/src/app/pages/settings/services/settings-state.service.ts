import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../../core/services/api.service';

@Injectable({ providedIn: 'root' })
export class SettingsStateService {
  private apiService = inject(ApiService);

  async loadAllSettings() {
    await Promise.all([
      this.apiService.loadSubjects(),
      this.apiService.loadTopics(),
      this.apiService.loadSkills(),
      this.apiService.loadExamTypes(),
      this.apiService.loadQuestionTypes(),
      this.apiService.loadJobRoles(),
    ]);
  }
}
