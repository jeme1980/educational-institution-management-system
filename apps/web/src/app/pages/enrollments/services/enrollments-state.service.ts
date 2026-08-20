import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../../core/services/api.service';

@Injectable({ providedIn: 'root' })
export class EnrollmentsStateService {
  private apiService = inject(ApiService);

  async createEnrollment(data: any) {
    return this.apiService.createEnrollment(data);
  }

  async loadStudents() {
    return this.apiService.loadStudents();
  }

  async loadClasses() {
    return this.apiService.loadClasses();
  }
}
