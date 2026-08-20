import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../../core/services/api.service';

@Injectable({ providedIn: 'root' })
export class StudyGroupsStateService {
  private apiService = inject(ApiService);

  studyGroups = this.apiService.studyGroups;

  async loadStudyGroups(includeArchived = false) {
    return this.apiService.loadStudyGroups(includeArchived);
  }

  async createStudyGroup(data: any) {
    return this.apiService.createStudyGroup(data);
  }

  async updateStudyGroup(id: string, data: any) {
    return this.apiService.updateStudyGroup(id, data);
  }

  async deleteStudyGroup(id: string) {
    return this.apiService.deleteStudyGroup(id);
  }

  async restoreStudyGroup(id: string) {
    return this.apiService.restoreStudyGroup(id);
  }
}
