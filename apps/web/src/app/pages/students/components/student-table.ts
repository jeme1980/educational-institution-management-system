import { ChangeDetectionStrategy, Component, input, output, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService, Student } from '../../../core/services/api.service';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { UiTableActionsComponent } from '../../../shared/components/ui-table-actions/ui-table-actions.component';
import { UiFilterPanelComponent } from '../../../shared/components/ui-filter-panel/ui-filter-panel.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-student-table',
  imports: [CommonModule, MatIconModule, MatTooltipModule, UiButtonComponent, UiTableActionsComponent, UiFilterPanelComponent],
  templateUrl: './student-table.html',
  styleUrl: './student-table.css',
})
export class StudentTable {
  apiService = inject(ApiService);

  students = input<Student[]>([]);
  searchTerm = input<string>('');
  classFilter = input<string>('');
  statusFilter = input<string>('');
  genderFilter = input<string>('');
  sortBy = input<string>('nameAr');
  sortOrder = input<'asc' | 'desc'>('asc');
  isLoading = input<boolean>(false);
  loadError = input<string>('');
  canEdit = input<boolean>(false);
  canDelete = input<boolean>(false);

  searchChange = output<string>();
  classFilterChange = output<string>();
  statusFilterChange = output<string>();
  genderFilterChange = output<string>();
  sortByChange = output<string>();
  sortOrderChange = output<'asc' | 'desc'>();
  clearFiltersChange = output<void>();

  viewDetails = output<Student>();
  edit = output<Student>();
  delete = output<string>();
  private searchTimeout: any;

  onSearchInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    this.searchTimeout = setTimeout(() => {
      this.searchChange.emit(value);
    }, 200);
  }

  toggleSort(field: string) {
    if (this.sortBy() === field) {
      this.sortOrderChange.emit(this.sortOrder() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortByChange.emit(field);
      this.sortOrderChange.emit('asc');
    }
  }

  clearFilters() {
    this.clearFiltersChange.emit();
  }

  rowNumber(rowIndex: number): number {
    return rowIndex + 1;
  }

  hasActiveFilters = computed(() => {
    return !!this.searchTerm() || !!this.classFilter() || !!this.statusFilter() || !!this.genderFilter();
  });


  getGenderIcon(genderId?: string): string {
    if (genderId === 'gnd-female' || genderId === 'female') return 'woman';
    return 'man';
  }

  getGenderLabel(genderId?: string): string {
    const gender = this.apiService.lookups()?.genders?.find((item: any) => item.id === genderId);
    if (gender?.nameAr) return gender.nameAr;
    if (genderId === 'gnd-female' || genderId === 'female') return 'أنثى';
    if (genderId === 'gnd-male' || genderId === 'male') return 'ذكر';
    return 'غير محدد';
  }

  getClassName(classId?: string): string {
    if (!classId) return 'غير معين بشعبة';
    const found = this.apiService.classes().find((c) => c.id === classId);
    return found ? `${found.nameAr} (الصف ${found.gradeLevel})` : 'شعبة مسجلة';
  }

  getClassCode(classId?: string): string {
    if (!classId) return 'غير محدد';
    const found: any = this.apiService.classes().find((c) => c.id === classId);
    if (!found) return 'غير محدد';
    return found.classCode
      || (found.gradeLevelInfo?.codeNumber != null ? `${found.gradeLevelInfo.codeNumber}-${found.parallelNumber}` : found.nameAr || 'غير محدد');
  }

  getContactPhone(student: Student): string {
    return (student as any).guardian?.primaryPhoneNumber || student.phoneNumber || '-';
  }

  getStatusLabel(statusId?: string): string {
    const lookupStatus = this.apiService.lookups()?.studentStatuses?.find((status: any) => status.id === statusId);
    if (lookupStatus?.nameAr) return lookupStatus.nameAr;

    switch (statusId) {
      case 'ACTIVE':
        return 'منتظم ومستمر';
      case 'GRADUATED':
        return 'متخرج';
      case 'SUSPENDED':
        return 'موقوف';
      case 'INACTIVE':
        return 'منقطع';
      default:
        return statusId || 'منتظم';
    }
  }

  getStatusClass(statusId?: string): string {
    const lookupStatus = this.apiService.lookups()?.studentStatuses?.find((status: any) => status.id === statusId);
    if (lookupStatus) {
      return lookupStatus.isActive === false
        ? 'rounded-full bg-danger-container px-2.5 py-1 text-xs font-bold text-danger border border-danger-container'
        : 'rounded-full bg-success-container px-2.5 py-1 text-xs font-bold text-success border border-success-container';
    }

    switch (statusId) {
      case 'ACTIVE':
        return 'rounded-full bg-success-container px-2.5 py-1 text-xs font-bold text-success border border-success-container';
      case 'GRADUATED':
        return 'rounded-full bg-primary-container px-2.5 py-1 text-xs font-bold text-primary border border-primary-container';
      case 'SUSPENDED':
        return 'rounded-full bg-warning-container px-2.5 py-1 text-xs font-bold text-warning border border-warning-container';
      case 'INACTIVE':
        return 'rounded-full bg-danger-container px-2.5 py-1 text-xs font-bold text-danger border border-danger-container';
      default:
        return 'rounded-full bg-success-container px-2.5 py-1 text-xs font-bold text-success border border-success-container';
    }
  }
}
