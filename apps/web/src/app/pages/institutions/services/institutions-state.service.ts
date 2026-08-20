import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../../core/services/api.service';

@Injectable({ providedIn: 'root' })
export class InstitutionsStateService {
  private apiService = inject(ApiService);

  institutions = this.apiService.institutions;

  async loadInstitutions() {
    return this.apiService.loadInstitutions();
  }

  async createInstitution(data: any) {
    return this.apiService.createInstitution(data);
  }

  async updateInstitution(id: string, data: any) {
    return this.apiService.updateInstitution(id, data);
  }

  async deleteInstitution(id: string) {
    return this.apiService.deleteInstitution(id);
  }
}
