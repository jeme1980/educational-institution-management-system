import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../core/services/api.service';
import { StaffMember, StaffAssignment } from '../models/staff.model';
import { StaffHeaderComponent } from '../components/staff-header.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { sanitizeSpreadsheetText } from '../../../core/utils/spreadsheet-security';
import { UiInputComponent } from '../../../shared/components/input/ui-input.component';
import { UiSelectComponent } from '../../../shared/components/select/ui-select.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-staff',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, StaffHeaderComponent, PaginationComponent, UiInputComponent, UiSelectComponent],
  templateUrl: './staff.component.html',
  styleUrl: './staff.component.css'
})
export class StaffComponent implements OnInit {
  apiService = inject(ApiService);
  fb = inject(FormBuilder);

  activeTab = signal<'staff_members' | 'staff_assignments'>('staff_members');
  searchTerm = signal<string>('');
  genderFilter = signal<string>('ALL');
  statusFilter = signal<string>('ALL');
  jobTitleFilter = signal<string>('ALL');

  assignmentRoleFilter = signal<string>('ALL');
  assignmentYearFilter = signal<string>('ALL');

  // Pagination Staff
  currentPage = signal<number>(1);
  itemsPerPage = 10;

  // Pagination Assignment
  currentAssignmentPage = signal<number>(1);

  // Profile View Modal
  selectedProfileStaff = signal<StaffMember | null>(null);
  showProfileModal = signal<boolean>(false);

  // Modals
  showModal = signal<boolean>(false);
  isEditMode = signal<boolean>(false);
  selectedStaffId = signal<string | null>(null);
  isSaving = signal<boolean>(false);
  memberToDelete = signal<StaffMember | null>(null);

  showAssignmentModal = signal<boolean>(false);
  isAssignmentEditMode = signal<boolean>(false);
  selectedAssignmentId = signal<string | null>(null);
  isSavingAssignment = signal<boolean>(false);
  assignmentToDelete = signal<StaffAssignment | null>(null);

  staffForm: FormGroup = this.fb.group({
    nationalId: [''],
    firstNameAr: ['', [Validators.required, Validators.maxLength(150)]],
    familyNameAr: ['', [Validators.required, Validators.maxLength(150)]],
    firstNameHe: [''],
    familyNameHe: [''],
    genderId: [null],
    specializationId: [null],
    phoneNumber: [''],
    email: ['', [Validators.email]],
    institutionId: ['', [Validators.required]],
    isArchived: [false],
  });

  assignmentForm: FormGroup = this.fb.group({
    institutionId: ['', [Validators.required]],
    staffMemberId: ['', [Validators.required]],
    jobRoleId: ['', [Validators.required]],
    academicYearId: ['', [Validators.required]],
    startDate: [new Date().toISOString().split('T')[0], [Validators.required]],
    endDate: [''],
    isPrimary: [false],
    isActive: [true],
    isArchived: [false],
    assignmentStatus: ['ACTIVE', [Validators.required]],
    subjectIds: [[]],
    notes: [''],
  });

  async ngOnInit() {
    await Promise.all([
      this.apiService.loadStaff(),
      this.apiService.loadJobRoles(),
      this.apiService.loadAcademicYears(),
      this.apiService.loadInstitutions(),
      this.apiService.loadLookups(),
      this.apiService.loadPublicLookups(),
      this.apiService.loadSubjects(),
      this.apiService.loadStaffAssignments(),
    ]);

    // Preselect defaults
    const staffList = this.apiService.staff();
    const rolesList = this.apiService.jobRoles().filter(role => role.isActive !== false);
    const yearsList = this.apiService.academicYears();

    if (staffList.length > 0) {
      this.assignmentForm.patchValue({ staffMemberId: staffList[0].id });
    }
    if (rolesList.length > 0) {
      this.assignmentForm.patchValue({ jobRoleId: rolesList[0].id });
    }
    if (yearsList.length > 0) {
      const cur = yearsList.find(y => y.isCurrent) || yearsList[0];
      this.assignmentForm.patchValue({ academicYearId: cur.id });
    }
    this.assignmentYearFilter.set(this.apiService.selectedAcademicYearId() || 'ALL');
  }

  // --- UNIQUE JOB TITLES COMPUTED ---
  uniqueJobTitles = computed(() => {
    const list = this.apiService.staff();
    return this.apiService.jobRoles().map(role => role.nameAr);
  });

  activeJobRoles = computed(() => {
    const institutionId = this.apiService.selectedInstitutionId();
    return this.apiService.jobRoles().filter(role =>
      role.isActive !== false && (!institutionId || role.institutionId === institutionId)
    );
  });

  // --- FILTERED STAFF MEMBERS ---
  filteredStaff = computed(() => {
    const list = this.apiService.staff();
    const term = this.searchTerm().trim().toLowerCase();
    const gender = this.genderFilter();
    const status = this.statusFilter();
    const title = this.jobTitleFilter();

    return list.filter(m => {
      const matchSearch =
        !term ||
        (m.firstNameAr && m.firstNameAr.toLowerCase().includes(term)) ||
        (m.familyNameAr && m.familyNameAr.toLowerCase().includes(term)) ||
        (m.nationalId && m.nationalId.toLowerCase().includes(term)) ||
        this.getPrimaryAssignmentRole(m.id).toLowerCase().includes(term);

      const matchGender =
        gender === 'ALL' ||
        (gender === 'MALE' && this.getGenderCode(m.genderId) === 'MALE') ||
        (gender === 'FEMALE' && this.getGenderCode(m.genderId) === 'FEMALE');

      const matchStatus =
        status === 'ALL' ||
        (status === 'ACTIVE' && !m.archivedAt) ||
        (status === 'ARCHIVED' && !!m.archivedAt);

    const matchTitle = title === 'ALL' || this.getPrimaryAssignmentRole(m.id) === title;

      return matchSearch && matchGender && matchStatus && matchTitle;
    });
  });

  // --- FILTERED STAFF ASSIGNMENTS ---
  filteredAssignments = computed(() => {
    const list = this.apiService.staffAssignments();
    const term = this.searchTerm().trim().toLowerCase();
    const roleId = this.assignmentRoleFilter();
    const selectedContextYearId = this.apiService.selectedAcademicYearId();
    const yearId = this.assignmentYearFilter();
    const effectiveYearId = selectedContextYearId || (yearId === 'ALL' ? null : yearId);

    return list.filter(a => {
      const staffName = this.getStaffName(a.staffMemberId, a).toLowerCase();
      const roleName = this.getJobRoleName(a.jobRoleId, a).toLowerCase();
      const notes = (a.notes || '').toLowerCase();

      const matchSearch =
        !term ||
        staffName.includes(term) ||
        roleName.includes(term) ||
        notes.includes(term);

      const matchRole = roleId === 'ALL' || a.jobRoleId === roleId;
      const matchYear = !effectiveYearId || a.academicYearId === effectiveYearId;

      return matchSearch && matchRole && matchYear;
    });
  });

  // --- PAGINATED AND RANGE HELPERS ---
  paginatedStaff = computed(() => {
    const start = (this.currentPage() - 1) * this.itemsPerPage;
    return this.filteredStaff().slice(start, start + this.itemsPerPage);
  });

  totalStaffPages = computed(() => {
    return Math.max(1, Math.ceil(this.filteredStaff().length / this.itemsPerPage));
  });

  getStaffRangeStart(): number {
    return this.filteredStaff().length === 0 ? 0 : (this.currentPage() - 1) * this.itemsPerPage + 1;
  }

  getStaffRangeEnd(): number {
    return Math.min(this.currentPage() * this.itemsPerPage, this.filteredStaff().length);
  }

  paginatedAssignments = computed(() => {
    const start = (this.currentAssignmentPage() - 1) * this.itemsPerPage;
    return this.filteredAssignments().slice(start, start + this.itemsPerPage);
  });

  totalAssignmentPages = computed(() => {
    return Math.max(1, Math.ceil(this.filteredAssignments().length / this.itemsPerPage));
  });

  getAssignmentRangeStart(): number {
    return this.filteredAssignments().length === 0 ? 0 : (this.currentAssignmentPage() - 1) * this.itemsPerPage + 1;
  }

  getAssignmentRangeEnd(): number {
    return Math.min(this.currentAssignmentPage() * this.itemsPerPage, this.filteredAssignments().length);
  }

  // --- AVATAR & INITIALS HELPERS ---
  getInitials(first = '', family = ''): string {
    const f = first.trim().charAt(0) || '';
    const l = family.trim().charAt(0) || '';
    return (f + l) || 'م';
  }

  getAvatarColor(name: string): string {
    const colors = [
      'bg-blue-50 text-[#00236f] border border-blue-100',
      'bg-emerald-50 text-emerald-700 border border-emerald-100',
      'bg-indigo-50 text-indigo-700 border border-indigo-100',
      'bg-purple-50 text-purple-700 border border-purple-100',
      'bg-rose-50 text-rose-700 border border-rose-100',
      'bg-amber-50 text-amber-700 border border-amber-100'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % colors.length;
    return colors[idx];
  }

  // --- DYNAMIC PROFILE ASSIGNMENTS ---
  selectedProfileAssignments = computed(() => {
    const staff = this.selectedProfileStaff();
    if (!staff) return [];
    return this.apiService.staffAssignments().filter(a => a.staffMemberId === staff.id);
  });

  // --- ACTIONS & EXPORT ---
  exportStaffList() {
    const list = this.filteredStaff();
    const headers = ['الاسم الأول بالعربية', 'اسم العائلة بالعربية', 'الرقم القومي', 'المسمى الوظيفي', 'الجنس', 'الحالة'];
    const rows = list.map(m => [
      m.firstNameAr,
      m.familyNameAr,
      m.nationalId || '',
      this.getPrimaryAssignmentRole(m.id),
      this.getGenderName(m.genderId),
      m.archivedAt ? 'غير نشط' : 'نشط'
    ]);
    
    const csvContent = '\ufeff' + headers.map(value => `"${String(sanitizeSpreadsheetText(value)).replace(/"/g, '""')}"`).join(',') + '\n' + rows.map(r => r.map(v => `"${String(sanitizeSpreadsheetText(v)).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `كادر_الموظفين_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  resetFilters() {
    this.searchTerm.set('');
    this.genderFilter.set('ALL');
    this.statusFilter.set('ALL');
    this.jobTitleFilter.set('ALL');
    this.assignmentRoleFilter.set('ALL');
    this.assignmentYearFilter.set(this.apiService.selectedAcademicYearId() || 'ALL');
    this.currentPage.set(1);
    this.currentAssignmentPage.set(1);
  }

  applyFilters() {
    this.currentPage.set(1);
    this.currentAssignmentPage.set(1);
  }

  updateSearchTerm(e: Event) {
    this.searchTerm.set((e.target as HTMLInputElement).value);
    this.currentPage.set(1);
    this.currentAssignmentPage.set(1);
  }

  updateGenderFilter(e: Event) {
    this.genderFilter.set((e.target as HTMLSelectElement).value);
    this.currentPage.set(1);
  }

  updateStatusFilter(e: Event) {
    this.statusFilter.set((e.target as HTMLSelectElement).value);
    this.currentPage.set(1);
  }

  updateJobTitleFilter(e: Event) {
    this.jobTitleFilter.set((e.target as HTMLSelectElement).value);
    this.currentPage.set(1);
  }

  updateAssignmentRoleFilter(e: Event) {
    this.assignmentRoleFilter.set((e.target as HTMLSelectElement).value);
    this.currentAssignmentPage.set(1);
  }

  updateAssignmentYearFilter(e: Event) {
    this.assignmentYearFilter.set((e.target as HTMLSelectElement).value);
    this.currentAssignmentPage.set(1);
  }

  getPageNumbers(total: number): number[] {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  // --- RESOLVING FOREIGN KEYS ---
  getStaffName(id?: string, assign?: StaffAssignment): string {
    if (assign?.staffFirstNameAr) {
      return `${assign.staffFirstNameAr} ${assign.staffFamilyNameAr || ''}`.trim();
    }
    if (!id) return 'غير محدد';
    const s = this.apiService.staff().find(x => x.id === id);
    return s ? `${s.firstNameAr} ${s.familyNameAr}` : id;
  }

  getGenderCode(id?: string | null): string {
    const gender = (this.apiService.lookups()?.genders || []).find((item: any) => item.id === id);
    return String(gender?.code || id || '').toUpperCase();
  }

  getGenderName(id?: string | null): string {
    const gender = (this.apiService.lookups()?.genders || []).find((item: any) => item.id === id);
    return gender?.nameAr || 'غير محدد';
  }

  getPrimaryAssignmentRole(staffMemberId: string): string {
    const assignment = this.apiService.staffAssignments().find(item => item.staffMemberId === staffMemberId && item.isPrimary)
      || this.apiService.staffAssignments().find(item => item.staffMemberId === staffMemberId);
    return this.getJobRoleName(assignment?.jobRoleId, assignment);
  }

  getJobRoleName(id?: string, assign?: StaffAssignment): string {
    if (assign?.jobRoleNameAr) return assign.jobRoleNameAr;
    if (!id) return 'غير محدد';
    const r = this.apiService.jobRoles().find(x => x.id === id);
    return r ? r.nameAr : id;
  }

  getAcademicYearLabel(id?: string, assign?: StaffAssignment): string {
    if (assign?.academicYearLabel) return assign.academicYearLabel;
    if (!id) return 'غير محدد';
    const y = this.apiService.academicYears().find(x => x.id === id);
    return y ? y.yearLabel : id;
  }

  formatDateForInput(dStr?: string | null): string {
    if (!dStr) return '';
    const d = new Date(dStr);
    return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
  }

  isSubjectSelected(subjectId: string): boolean {
    return (this.assignmentForm.get('subjectIds')?.value || []).includes(subjectId);
  }

  toggleSubject(subjectId: string) {
    const control = this.assignmentForm.get('subjectIds');
    const selected: string[] = control?.value || [];
    control?.setValue(selected.includes(subjectId)
      ? selected.filter(id => id !== subjectId)
      : [...selected, subjectId]);
    control?.markAsDirty();
  }

  // --- MODALS ACTIONS ---
  openProfileModal(m: StaffMember) {
    this.selectedProfileStaff.set(m);
    this.showProfileModal.set(true);
  }

  addAssignmentShortcut(m: StaffMember) {
    this.showProfileModal.set(false);
    this.isAssignmentEditMode.set(false);
    this.selectedAssignmentId.set(null);
    this.assignmentForm.reset({
      institutionId: m.institutionId || '',
      staffMemberId: m.id,
      jobRoleId: this.activeJobRoles().length > 0 ? this.activeJobRoles()[0].id : '',
      academicYearId: this.apiService.academicYears().length > 0 ? (this.apiService.academicYears().find(y => y.isCurrent)?.id || this.apiService.academicYears()[0].id) : '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      isPrimary: false,
      isActive: true,
      isArchived: false,
      assignmentStatus: 'ACTIVE',
      subjectIds: [],
      notes: ''
    });
    this.showAssignmentModal.set(true);
  }

  openAddModal() {
    this.isEditMode.set(false);
    this.selectedStaffId.set(null);
    this.staffForm.reset({
      nationalId: '',
      firstNameAr: '',
      familyNameAr: '',
      firstNameHe: '',
      familyNameHe: '',
      genderId: null,
      specializationId: null,
      phoneNumber: '',
      email: '',
      institutionId: this.apiService.selectedInstitutionId() || this.apiService.institutions()[0]?.id || '',
      isArchived: false
    });
    this.showModal.set(true);
  }

  openEditModal(m: StaffMember) {
    this.isEditMode.set(true);
    this.selectedStaffId.set(m.id);
    this.staffForm.patchValue({
      nationalId: m.nationalId || '',
      firstNameAr: m.firstNameAr,
      familyNameAr: m.familyNameAr,
      firstNameHe: m.firstNameHe || '',
      familyNameHe: m.familyNameHe || '',
      genderId: m.genderId || null,
      specializationId: m.specializationId || null,
      phoneNumber: m.phoneNumber || '',
      email: m.email || '',
      institutionId: m.institutionId || '',
      isArchived: !!m.archivedAt
    });
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
  }

  async saveStaff() {
    if (this.staffForm.invalid) {
      this.staffForm.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    const v = this.staffForm.value;
    const payload = {
      nationalId: String(v.nationalId || '').trim() || null,
      firstNameAr: String(v.firstNameAr || '').trim(),
      familyNameAr: String(v.familyNameAr || '').trim(),
      firstNameHe: String(v.firstNameHe || '').trim() || null,
      familyNameHe: String(v.familyNameHe || '').trim() || null,
      genderId: v.genderId || null,
      specializationId: v.specializationId || null,
      phoneNumber: String(v.phoneNumber || '').trim() || null,
      email: String(v.email || '').trim() || null,
      institutionId: v.institutionId || this.apiService.selectedInstitutionId() || this.apiService.institutions()[0]?.id || '',
      archivedAt: v.isArchived ? new Date().toISOString() : null
    };

    let ok = false;
    if (this.isEditMode() && this.selectedStaffId()) {
      ok = await this.apiService.updateStaff(this.selectedStaffId()!, payload);
    } else {
      ok = await this.apiService.createStaff(payload);
    }

    this.isSaving.set(false);
    if (ok) this.closeModal();
  }

  openDeleteConfirm(m: StaffMember) {
    this.memberToDelete.set(m);
  }

  async confirmDelete() {
    const m = this.memberToDelete();
    if (m && await this.apiService.deleteStaff(m.id)) {
      this.memberToDelete.set(null);
    }
  }

  // --- ASSIGNMENT ACTIONS ---
  openAddAssignmentModal() {
    this.isAssignmentEditMode.set(false);
    this.selectedAssignmentId.set(null);
    const staff = this.apiService.staff();
    const roles = this.activeJobRoles();
    const years = this.apiService.academicYears();

    this.assignmentForm.reset({
      institutionId: this.apiService.selectedInstitutionId() || this.apiService.institutions()[0]?.id || '',
      staffMemberId: staff.length > 0 ? staff[0].id : '',
      jobRoleId: roles.length > 0 ? roles[0].id : '',
      academicYearId: years.length > 0 ? (years.find(y => y.isCurrent)?.id || years[0].id) : '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      isPrimary: false,
      isActive: true,
      isArchived: false,
      assignmentStatus: 'ACTIVE',
      subjectIds: [],
      notes: ''
    });
    this.showAssignmentModal.set(true);
  }

  openEditAssignmentModal(a: StaffAssignment) {
    this.isAssignmentEditMode.set(true);
    this.selectedAssignmentId.set(a.id);
    this.assignmentForm.patchValue({
      institutionId: a.institutionId || '',
      staffMemberId: a.staffMemberId || '',
      jobRoleId: a.jobRoleId || '',
      academicYearId: a.academicYearId || '',
      startDate: this.formatDateForInput(a.startDate),
      endDate: this.formatDateForInput(a.endDate),
      isPrimary: Boolean(a.isPrimary),
      isActive: Boolean(a.isActive),
      isArchived: Boolean(a.archivedAt),
      assignmentStatus: a.archivedAt ? 'ARCHIVED' : (a.isActive ? 'ACTIVE' : 'INACTIVE'),
      subjectIds: a.subjectIds || [],
      notes: a.notes || ''
    });
    this.showAssignmentModal.set(true);
  }

  closeAssignmentModal() {
    this.showAssignmentModal.set(false);
  }

  async saveAssignment() {
    if (this.assignmentForm.invalid) {
      this.assignmentForm.markAllAsTouched();
      this.apiService.usersApi.staffAssignmentError.set('يرجى استكمال الحقول المطلوبة قبل الحفظ.');
      return;
    }
    this.isSavingAssignment.set(true);
    const v = this.assignmentForm.value;
    const payload = {
      institutionId: v.institutionId || '',
      staffMemberId: v.staffMemberId,
      jobRoleId: String(v.jobRoleId || '').trim(),
      academicYearId: v.academicYearId,
      startDate: v.startDate,
      endDate: v.endDate || null,
      isPrimary: v.isPrimary,
      isActive: v.assignmentStatus === 'ACTIVE',
      subjectIds: v.subjectIds || [],
      notes: v.notes || null,
      archivedAt: v.assignmentStatus === 'ARCHIVED' ? new Date().toISOString() : null
    };

    let ok = false;
    if (this.isAssignmentEditMode() && this.selectedAssignmentId()) {
      ok = await this.apiService.updateStaffAssignment(this.selectedAssignmentId()!, payload);
    } else {
      ok = await this.apiService.createStaffAssignment(payload);
    }

    this.isSavingAssignment.set(false);
    if (ok) this.closeAssignmentModal();
    else this.apiService.usersApi.staffAssignmentError.set(this.apiService.usersApi.staffAssignmentError() || 'تعذر حفظ التعيين.');
  }

  openDeleteAssignmentConfirm(a: StaffAssignment) {
    this.assignmentToDelete.set(a);
  }

  async confirmDeleteAssignment() {
    const a = this.assignmentToDelete();
    if (a && await this.apiService.deleteStaffAssignment(a.id)) {
      this.assignmentToDelete.set(null);
    }
  }
}
