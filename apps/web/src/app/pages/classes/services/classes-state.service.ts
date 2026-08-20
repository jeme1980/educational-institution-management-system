import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../../core/services/api.service';
import { ClassFormValue } from '../../../core/models/api.models';

@Injectable({ providedIn: 'root' })
export class ClassesStateService {
  private apiService = inject(ApiService);

  classes = this.apiService.classes;

  async loadClasses() {
    return this.apiService.loadClasses();
  }

  async createClass(data: ClassFormValue) {
    return this.apiService.createClass(data);
  }

  async updateClass(id: string, data: ClassFormValue) {
    return this.apiService.updateClass(id, data);
  }

  async deleteClass(id: string) {
    return this.apiService.deleteClass(id);
  }
}
