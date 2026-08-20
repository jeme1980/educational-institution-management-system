import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../../core/services/api.service';

@Injectable({ providedIn: 'root' })
export class DashboardStateService {
  private apiService = inject(ApiService);

  async loadDashboardStats() {
    return this.apiService.loadDashboardStats();
  }
}
