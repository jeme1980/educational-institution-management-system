import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../../core/services/api.service';

@Injectable({ providedIn: 'root' })
export class StaffStateService {
  private apiService = inject(ApiService);

  staffMembers = this.apiService.staff;
  staffAssignments = this.apiService.staffAssignments;

  async loadStaffMembers() {
    return this.apiService.loadStaff();
  }

  async loadStaffAssignments() {
    return this.apiService.loadStaffAssignments();
  }

  async createStaffMember(data: any) {
    return this.apiService.createStaff(data);
  }

  async updateStaffMember(id: string, data: any) {
    return this.apiService.updateStaff(id, data);
  }
}
