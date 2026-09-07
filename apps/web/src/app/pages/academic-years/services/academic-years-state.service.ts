import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../../core/services/api.service';
import { AcademicYear, AcademicPeriod, AcademicYearUpdatePayload } from '../models/academic-year.model';

@Injectable({ providedIn: 'root' })
export class AcademicYearsStateService {
  private apiService = inject(ApiService);

  academicYears = this.apiService.academicYears;
  academicPeriods = this.apiService.academicPeriods;

  async loadAcademicYears() {
    return this.apiService.loadAcademicYears();
  }

  async loadAcademicPeriods() {
    return this.apiService.loadAcademicPeriods();
  }

  async createAcademicYear(data: any) {
    return this.apiService.createAcademicYear(data);
  }

  async updateAcademicYear(id: string, data: AcademicYearUpdatePayload) {
    return this.apiService.updateAcademicYear(id, data);
  }

  async deleteAcademicYear(id: string) {
    return this.apiService.deleteAcademicYear(id);
  }

  async archiveAcademicYear(id: string) {
    return this.apiService.archiveAcademicYear(id);
  }

  async createAcademicPeriod(data: any) {
    return this.apiService.createAcademicPeriod(data);
  }

  async updateAcademicPeriod(id: string, data: any) {
    return this.apiService.updateAcademicPeriod(id, data);
  }

  async deleteAcademicPeriod(id: string) {
    return this.apiService.deleteAcademicPeriod(id);
  }
}
