import { ChangeDetectionStrategy, Component, input, output, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService, Student } from '../../../core/services/api.service';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { UiTableActionsComponent } from '../../../shared/components/ui-table-actions/ui-table-actions.component';
import { UiFilterPanelComponent } from '../../../shared/components/ui-filter-panel/ui-filter-panel.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-student-table',
  imports: [CommonModule, MatIconModule, MatTooltipModule, PaginationComponent, UiButtonComponent, UiTableActionsComponent, UiFilterPanelComponent],
  templateUrl: './student-table.html',
  styleUrl: './student-table.css',
})
export class StudentTable {
  apiService = inject(ApiService);

  students = input<Student[]>([]);
  totalCount = input<number>(0);
  serverTotalPages = input<number | null>(null);
  searchTerm = input<string>('');
  classFilter = input<string>('');
  statusFilter = input<string>('');
  genderFilter = input<string>('');
  sortBy = input<string>('nameAr');
  sortOrder = input<'asc' | 'desc'>('asc');
  currentPage = input<number>(1);
  pageSize = input<number>(10);
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
  pageChange = output<number>();
  pageSizeChange = output<number>();
  clearFiltersChange = output<void>();

  viewDetails = output<Student>();
  edit = output<Student>();
  delete = output<string>();
  viewMode = signal<'table' | 'cards'>('table');
  actionMenuId = signal<string | null>(null);

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

  setViewMode(mode: 'table' | 'cards') {
    this.viewMode.set(mode);
  }

  rowNumber(rowIndex: number): number {
    const size = this.pageSize();
    return size === -1 ? rowIndex + 1 : ((this.currentPage() - 1) * size) + rowIndex + 1;
  }

  toggleActionMenu(studentId: string) {
    this.actionMenuId.set(this.actionMenuId() === studentId ? null : studentId);
  }

  closeActionMenu() {
    this.actionMenuId.set(null);
  }

  hasActiveFilters = computed(() => {
    return !!this.searchTerm() || !!this.classFilter() || !!this.statusFilter() || !!this.genderFilter();
  });

  totalPages = computed(() => {
    const total = this.totalCount();
    const size = this.pageSize();
    if (size === -1 || total === 0) return 1;
    return Math.ceil(total / size);
  });

  getPagesArray = computed(() => {
    const pages: number[] = [];
    const total = this.totalPages();
    const current = this.currentPage();
    
    // Display up to 5 surrounding page numbers
    let start = Math.max(1, current - 2);
    const end = Math.min(total, start + 4);
    if (end - start < 4) {
      start = Math.max(1, end - 4);
    }
    for (let i = start; i <= end; i++) {
      if (i >= 1 && i <= total) {
        pages.push(i);
      }
    }
    return pages;
  });

  getDisplayRangeStart = computed(() => {
    if (this.totalCount() === 0) return 0;
    return (this.currentPage() - 1) * this.pageSize() + 1;
  });

  getDisplayRangeEnd = computed(() => {
    const size = this.pageSize();
    if (size === -1) return this.totalCount();
    return Math.min(this.totalCount(), this.currentPage() * size);
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

  formatDate(d?: string): string {
    if (!d) return 'غير محدد';
    try {
      return new Date(d).toISOString().split('T')[0];
    } catch {
      return d;
    }
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

  getClassSectionName(classId?: string): string {
    if (!classId) return 'غير معين بشعبة';
    const found = this.apiService.classes().find((c) => c.id === classId);
    return found?.nameAr || 'شعبة مسجلة';
  }

  getStageName(classId?: string): string {
    if (!classId) return 'غير محدد';
    const found = this.apiService.classes().find((c) => c.id === classId);
    return found?.stage?.nameAr || found?.stageId || 'غير محدد';
  }

  getGradeLevelName(classId?: string): string {
    if (!classId) return 'غير محدد';
    const found = this.apiService.classes().find((c) => c.id === classId);
    return found?.gradeLevel || found?.gradeLevelInfo?.nameAr || found?.gradeLevelId || 'غير محدد';
  }

  getInstitutionName(instId?: string): string {
    if (!instId) return 'المدرسة المركزية';
    const found = this.apiService.institutions().find((i) => i.id === instId);
    return found ? found.nameAr : 'المؤسسة التعليمية';
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
