import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ApiService, Student } from '../../../core/services/api.service';
import { StudentStateService } from '../services/student-state.service';
import { StudentHeader } from '../components/student-header';
import { StudentMetrics } from '../components/student-metrics';
import { StudentTable } from '../components/student-table';
import { StudentDetailsModal } from '../components/student-details-modal';
import { StudentFormModal } from '../components/student-form-modal';
import { TabType, DetailTabType, ToastState } from '../models/student.model';
import { firstValueFrom } from 'rxjs';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-students',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatIconModule,
    StudentHeader,
    StudentMetrics,
    StudentTable,
    StudentDetailsModal,
    StudentFormModal,
  ],
  templateUrl: './students.component.html',
  styleUrl: './students.component.css',
})
export class StudentsComponent implements OnInit {
  apiService = inject(ApiService);
  studentStateService = inject(StudentStateService);
  confirmDialog = inject(ConfirmDialogService);
  authService = inject(AuthService);
  fb = inject(FormBuilder);

  searchTerm = signal<string>('');
  classFilter = signal<string>('');
  statusFilter = signal<string>('');
  genderFilter = signal<string>('');
  sortBy = signal<string>('nameAr');
  sortOrder = signal<'asc' | 'desc'>('asc');
  currentPage = signal<number>(1);
  pageSize = signal<number>(10);

  showModal = signal<boolean>(false);
  isEditing = signal<boolean>(false);
  editingId = signal<string | null>(null);
  activeTab = signal<TabType>('basic');

  showDetailsModal = signal<boolean>(false);
  selectedStudentDetails = signal<Student | null>(null);
  activeDetailTab = signal<DetailTabType>('academic');

  toast = signal<ToastState | null>(null);
  importErrors = signal<string[]>([]);
  isExportingStudents = signal(false);
  studentLoadError = signal('');

  canCreateStudents = computed(() => this.authService.hasPermission('students:create'));
  canUpdateStudents = computed(() => this.authService.hasPermission('students:update'));
  canDeleteStudents = computed(() => this.authService.hasPermission('students:delete'));

  studentForm = this.fb.group({
    nationalId: ['', [Validators.required, Validators.maxLength(10)]],
    institutionId: ['', [Validators.required]],
    classId: [''],
    studentStatusId: ['student-status-active', [Validators.required]],

    firstNameAr: ['', [Validators.required]],
    lastNameAr: ['', [Validators.required]],
    firstNameHe: [''],
    lastNameHe: [''],

    genderId: ['gender-unspecified'],
    birthDate: [''],
    photoUrl: [''],
    townId: [''],

    phoneNumber: [''],
    email: [''],
    addressAr: [''],
    addressHe: [''],

    notes: [''],
    isActive: [true],

    // Medical profile
    bloodType: [''],
    allergiesDescription: [''],
    chronicConditions: [''],
    emergencyInstructions: [''],
    hasSpecialNeeds: [false],
    specialNeedsNotes: [''],

    // Guardian
    guardianFirstNameAr: [''],
    guardianLastNameAr: [''],
    guardianFirstNameHe: [''],
    guardianLastNameHe: [''],
    guardianPrimaryPhoneNumber: [''],
    guardianSecondaryPhoneNumber: [''],
    guardianEmail: [''],
    guardianAddressAr: [''],
    guardianAddressHe: [''],
    relationTypeId: ['parent'],
  });

  filteredStudents = computed(() => {
    let list = this.studentStateService.students();
    const search = this.searchTerm().toLowerCase().trim();

    if (search) {
      list = list.filter((s) => {
        const fullAr = `${s.firstNameAr || ''} ${s.lastNameAr || ''}`.toLowerCase();
        const fullHe = `${s.firstNameHe || ''} ${s.lastNameHe || ''}`.toLowerCase();
        const nationalId = (s.nationalId || '').toLowerCase();
        const phone = (s.phoneNumber || '').toLowerCase();
        const addr = (s.addressAr || '').toLowerCase();

        return (
          fullAr.includes(search) ||
          fullHe.includes(search) ||
          nationalId.includes(search) ||
          phone.includes(search) ||
          addr.includes(search)
        );
      });
    }

    // Class Filter
    const classId = this.classFilter();
    if (classId) {
      list = list.filter((s) => s.classId === classId);
    }

    // Status Filter
    const statusId = this.statusFilter();
    if (statusId) {
      list = list.filter((s) => s.studentStatusId === statusId);
    }

    // Gender Filter
    const genderId = this.genderFilter();
    if (genderId) {
      list = list.filter((s) => s.genderId === genderId);
    }

    // Sorting
    const sort = this.sortBy();
    const order = this.sortOrder();
    list = [...list].sort((a, b) => {
      let comp = 0;
      if (sort === 'nameAr') {
        const nameA = `${a.firstNameAr || ''} ${a.lastNameAr || ''}`;
        const nameB = `${b.firstNameAr || ''} ${b.lastNameAr || ''}`;
        comp = nameA.localeCompare(nameB, 'ar');
      } else if (sort === 'birthDate') {
        const dateA = a.birthDate ? new Date(a.birthDate).getTime() : 0;
        const dateB = b.birthDate ? new Date(b.birthDate).getTime() : 0;
        comp = dateA - dateB;
      } else if (sort === 'nationalId') {
        const idA = a.nationalId || '';
        const idB = b.nationalId || '';
        comp = idA.localeCompare(idB);
      }
      return order === 'asc' ? comp : -comp;
    });

    return list;
  });

  paginatedStudents = computed(() => this.studentStateService.students());

  onSearchChange(term: string) {
    this.searchTerm.set(term);
    this.currentPage.set(1);
    this.loadCurrentPage();
  }

  onClassFilterChange(value: string) { this.classFilter.set(value); this.currentPage.set(1); this.loadCurrentPage(); }
  onStatusFilterChange(value: string) { this.statusFilter.set(value); this.currentPage.set(1); this.loadCurrentPage(); }
  onGenderFilterChange(value: string) { this.genderFilter.set(value); this.currentPage.set(1); this.loadCurrentPage(); }
  onSortByChange(value: string) { this.sortBy.set(value); this.currentPage.set(1); this.loadCurrentPage(); }
  onSortOrderChange(value: 'asc' | 'desc') { this.sortOrder.set(value); this.currentPage.set(1); this.loadCurrentPage(); }
  onPageChange(page: number) { this.currentPage.set(page); this.loadCurrentPage(); }
  onPageSizeChange(size: number) { this.pageSize.set(size); this.currentPage.set(1); this.loadCurrentPage(); }
  onClearFilters() {
    this.searchTerm.set('');
    this.classFilter.set('');
    this.statusFilter.set('');
    this.genderFilter.set('');
    this.currentPage.set(1);
    this.loadCurrentPage();
  }

  private loadCurrentPage() {
    this.studentLoadError.set('');
    this.studentStateService.loadStudents(this.searchTerm(), false, {
      page: this.currentPage(),
      pageSize: this.pageSize(),
      classId: this.classFilter(),
      statusId: this.statusFilter(),
      genderId: this.genderFilter(),
      sortBy: this.sortBy(),
      sortOrder: this.sortOrder(),
    }).subscribe({ error: (error) => this.studentLoadError.set(error.message || 'تعذر تحميل قائمة الطلاب.') });
  }

  activeStudentsCount = computed(() => {
    return this.studentStateService.students().filter(s => s.studentStatusId === 'student-status-active' || s.isActive).length;
  });

  studentsWithGuardiansCount = computed(() => {
    return this.studentStateService.students().filter(s => !!s.guardian || !!s.relationTypeId).length;
  });

  ngOnInit() {
    this.loadCurrentPage();
    this.apiService.loadClasses();
    this.apiService.loadInstitutions();
    // The student form uses the towns table directly. Load it when this page
    // opens so the town selector is populated independently of global context
    // loading/navigation timing.
    this.apiService.loadTowns();
    this.apiService.loadLookups();
  }

  showToast(type: 'success' | 'error' | 'info', message: string) {
    this.toast.set({ type, message });
    setTimeout(() => {
      if (this.toast()?.message === message) {
        this.toast.set(null);
      }
    }, 6000);
  }

  viewStudentDetails(student: Student) {
    this.selectedStudentDetails.set(student);
    this.activeDetailTab.set('academic');
    this.showDetailsModal.set(true);
  }

  openCreateModal() {
    this.isEditing.set(false);
    this.editingId.set(null);
    this.activeTab.set('basic');
    this.showModal.set(true);
    this.studentForm.reset({
      nationalId: '',
      institutionId: this.apiService.selectedInstitutionId() || this.apiService.institutions()[0]?.id || '',
      classId: this.apiService.classes()[0]?.id || '',
      studentStatusId: this.apiService.lookups()?.studentStatuses?.find((status: any) => status.isActive)?.id || '',
      firstNameAr: '',
      lastNameAr: '',
      firstNameHe: '',
      lastNameHe: '',
      genderId: this.apiService.lookups()?.genders?.find((gender: any) => gender.isActive !== false)?.id || '',
      birthDate: '2012-01-01',
      photoUrl: '',
      townId: '',
      phoneNumber: '',
      email: '',
      addressAr: '',
      addressHe: '',
      notes: '',
      isActive: true,

      // Medical profile
      bloodType: '',
      allergiesDescription: '',
      chronicConditions: '',
      emergencyInstructions: '',
      hasSpecialNeeds: false,
      specialNeedsNotes: '',

      // Guardian
      guardianFirstNameAr: '',
      guardianLastNameAr: '',
      guardianFirstNameHe: '',
      guardianLastNameHe: '',
      guardianPrimaryPhoneNumber: '',
      guardianSecondaryPhoneNumber: '',
      guardianEmail: '',
      guardianAddressAr: '',
      guardianAddressHe: '',
      relationTypeId: 'parent',
    });
  }

  openEditModal(student: Student) {
    this.isEditing.set(true);
    this.editingId.set(student.id);
    this.activeTab.set('basic');

    let birthFormatted = '';
    if (student.birthDate) {
      try {
        birthFormatted = new Date(student.birthDate).toISOString().split('T')[0];
      } catch {
        birthFormatted = student.birthDate;
      }
    }

    this.studentForm.patchValue({
      nationalId: student.nationalId || '',
      institutionId: student.institutionId || '',
      classId: student.classId || '',
      studentStatusId: student.studentStatusId || 'student-status-active',
      firstNameAr: student.firstNameAr,
      lastNameAr: student.lastNameAr,
      firstNameHe: student.firstNameHe || '',
      lastNameHe: student.lastNameHe || '',
      genderId: student.genderId || 'gender-unspecified',
      birthDate: birthFormatted,
      photoUrl: student.photoUrl || '',
      townId: student.townId || '',
      phoneNumber: student.phoneNumber || '',
      email: student.email || '',
      addressAr: student.addressAr || '',
      addressHe: student.addressHe || '',
      notes: student.notes || '',
      isActive: student.isActive !== undefined ? student.isActive : true,

      // Medical profile
      bloodType: student.medicalProfile?.bloodType || '',
      allergiesDescription: student.medicalProfile?.allergiesDescription || '',
      chronicConditions: student.medicalProfile?.chronicConditions || '',
      emergencyInstructions: student.medicalProfile?.emergencyInstructions || '',
      hasSpecialNeeds: student.medicalProfile?.hasSpecialNeeds || false,
      specialNeedsNotes: student.medicalProfile?.specialNeedsNotes || '',

      // Guardian
      guardianFirstNameAr: student.guardian?.firstNameAr || '',
      guardianLastNameAr: student.guardian?.lastNameAr || '',
      guardianFirstNameHe: student.guardian?.firstNameHe || '',
      guardianLastNameHe: student.guardian?.lastNameHe || '',
      guardianPrimaryPhoneNumber: student.guardian?.primaryPhoneNumber || '',
      guardianSecondaryPhoneNumber: student.guardian?.secondaryPhoneNumber || '',
      guardianEmail: student.guardian?.email || '',
      guardianAddressAr: student.guardian?.addressAr || '',
      guardianAddressHe: student.guardian?.addressHe || '',
      relationTypeId: student.relationTypeId || 'parent',
    });
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.editingId.set(null);
  }

  saveStudent() {
    if (this.studentForm.invalid) return;

    const val = this.studentForm.value;
    const studentPayload = {
      nationalId: val.nationalId ?? undefined,
      classId: val.classId ?? undefined,
      studentStatusId: val.studentStatusId ?? undefined,
      firstNameAr: val.firstNameAr ?? '',
      lastNameAr: val.lastNameAr ?? '',
      firstNameHe: val.firstNameHe ?? undefined,
      lastNameHe: val.lastNameHe ?? undefined,
      genderId: val.genderId ?? undefined,
      birthDate: val.birthDate ?? undefined,
      photoUrl: val.photoUrl ?? undefined,
      townId: val.townId ?? undefined,
      phoneNumber: val.phoneNumber ?? undefined,
      email: val.email ?? undefined,
      addressAr: val.addressAr ?? undefined,
      addressHe: val.addressHe ?? undefined,
      notes: val.notes ?? undefined,
      isActive: val.isActive !== undefined && val.isActive !== null ? Boolean(val.isActive) : true,
      
      relationTypeId: val.relationTypeId ?? undefined,
      medicalProfile: (val.bloodType || val.allergiesDescription || val.chronicConditions || val.emergencyInstructions || val.hasSpecialNeeds || val.specialNeedsNotes) ? {
        bloodType: val.bloodType || undefined,
        allergiesDescription: val.allergiesDescription || undefined,
        chronicConditions: val.chronicConditions || undefined,
        emergencyInstructions: val.emergencyInstructions || undefined,
        hasSpecialNeeds: val.hasSpecialNeeds !== undefined && val.hasSpecialNeeds !== null ? Boolean(val.hasSpecialNeeds) : false,
        specialNeedsNotes: val.specialNeedsNotes || undefined,
      } : null,
      guardian: (val.guardianFirstNameAr || val.guardianLastNameAr || val.guardianPrimaryPhoneNumber) ? {
        firstNameAr: val.guardianFirstNameAr || '',
        lastNameAr: val.guardianLastNameAr || '',
        firstNameHe: val.guardianFirstNameHe || undefined,
        lastNameHe: val.guardianLastNameHe || undefined,
        primaryPhoneNumber: val.guardianPrimaryPhoneNumber || '',
        secondaryPhoneNumber: val.guardianSecondaryPhoneNumber || undefined,
        email: val.guardianEmail || undefined,
        addressAr: val.guardianAddressAr || undefined,
        addressHe: val.guardianAddressHe || undefined,
      } : null
    };

    if (this.isEditing() && this.editingId()) {
      this.studentStateService.updateStudent(this.editingId()!, studentPayload).subscribe({
        next: (ok) => {
          if (ok) {
            this.closeModal();
            this.showToast('success', 'تم تحديث بيانات الطالب بنجاح!');
          } else {
            this.showToast('error', 'فشل تحديث بيانات الطالب.');
          }
        },
        error: (err) => this.showToast('error', err.message || 'حدث خطأ أثناء تحديث البيانات')
      });
    } else {
      this.studentStateService.createStudent(studentPayload).subscribe({
        next: (ok) => {
          if (ok) {
            this.closeModal();
            this.showToast('success', 'تم تسجيل الطالب الجديد بنجاح!');
          } else {
            this.showToast('error', 'فشل إضافة الطالب الجديد.');
          }
        },
        error: (err) => this.showToast('error', err.message || 'حدث خطأ أثناء تسجيل الطالب')
      });
    }
  }

  async deleteStudent(id: string) {
    if (await this.confirmDialog.confirm({
      title: 'أرشفة الطالب',
      message: 'هل تريد أرشفة هذا الطالب؟ سيتم إخفاؤه من السجل النشط مع الاحتفاظ ببياناته التاريخية.',
      confirmText: 'أرشفة',
      cancelText: 'إلغاء',
      variant: 'danger',
    })) {
      this.studentStateService.deleteStudent(id).subscribe({
        next: (ok) => {
          if (ok) {
            this.showToast('success', 'تمت إزالة الطالب وتحديث السجلات بنجاح.');
          } else {
            this.showToast('error', 'تعذر إزالة الطالب.');
          }
        },
        error: (err) => this.showToast('error', err.message || 'حدث خطأ أثناء محاولة الحذف')
      });
    }
  }

  private formatExcelDate(value: unknown): string {
    let date: Date | null = null;

    if (value instanceof Date) {
      date = value;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      const excelEpoch = Date.UTC(1899, 11, 30);
      date = new Date(excelEpoch + value * 24 * 60 * 60 * 1000);
    } else if (typeof value === 'string') {
      const raw = value.trim();
      const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      const displayMatch = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
      if (isoMatch) {
        return this.toDisplayDate(Number(isoMatch[3]), Number(isoMatch[2]), Number(isoMatch[1])) || raw;
      }
      if (displayMatch) {
        return this.toDisplayDate(Number(displayMatch[1]), Number(displayMatch[2]), Number(displayMatch[3])) || raw;
      }
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) date = parsed;
    }

    if (!date || Number.isNaN(date.getTime())) return String(value ?? '');
    return this.toDisplayDate(date.getUTCDate(), date.getUTCMonth() + 1, date.getUTCFullYear()) || String(value ?? '');
  }

  private toDisplayDate(day: number, month: number, year: number): string | null {
    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
  }

  private normalizeImportedDate(value: string): string | null {
    const raw = value.trim();
    if (!raw) return null;
    const displayMatch = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (displayMatch) {
      const display = this.toDisplayDate(Number(displayMatch[1]), Number(displayMatch[2]), Number(displayMatch[3]));
      if (!display) return null;
      const [day, month, year] = display.split('/');
      return `${year}-${month}-${day}`;
    }
    const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
      const display = this.toDisplayDate(Number(isoMatch[3]), Number(isoMatch[2]), Number(isoMatch[1]));
      if (!display) return null;
      const [day, month, year] = display.split('/');
      return `${year}-${month}-${day}`;
    }
    return null;
  }

  private normalizeImportedClassCode(value: unknown): string {
    const raw = String(value ?? '').trim();
    const match = raw.match(/^(\d+)\s*-\s*(\d+)$/);
    return match ? `${Number(match[1])}-${Number(match[2])}` : raw;
  }

  async exportTemplate(): Promise<void> {
    const activeInstId = this.apiService.selectedInstitutionId() || '';
    const activeInst = this.apiService.institutions().find((i) => i.id === activeInstId);
    const instName = activeInst ? activeInst.nameAr : 'المدرسة_المحددة';
    
    const activeYearId = this.apiService.selectedAcademicYearId()
      || this.apiService.academicYears().find((year: any) => year.isCurrent)?.id
      || '';
    const activeClass = this.apiService.classes().find((c) => c.institutionId === activeInstId && (!activeYearId || c.academicYearId === activeYearId));

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Students');
    worksheet.columns = [
      { header: 'nationalId', key: 'nationalId', width: 18 },
      { header: 'firstNameAr', key: 'firstNameAr', width: 18 },
      { header: 'lastNameAr', key: 'lastNameAr', width: 18 },
      { header: 'firstNameHe', key: 'firstNameHe', width: 18 },
      { header: 'lastNameHe', key: 'lastNameHe', width: 18 },
      { header: 'birthDate', key: 'birthDate', width: 16 },
      { header: 'genderCode', key: 'genderCode', width: 14 },
      { header: 'institutionId', key: 'institutionId', width: 38 },
      { header: 'classCode', key: 'classCode', width: 14 },
    ];
    worksheet.addRows([
      { nationalId: '987654321', firstNameAr: 'أحمد', lastNameAr: 'محمد', firstNameHe: '', lastNameHe: '', birthDate: '', genderCode: '', institutionId: activeInstId, classCode: activeClass?.classCode || '' },
      { nationalId: '123456789', firstNameAr: 'سارة', lastNameAr: 'خالد', firstNameHe: '', lastNameHe: '', birthDate: '', genderCode: '', institutionId: activeInstId, classCode: activeClass?.classCode || '' },
    ]);
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123B82' } };
    worksheet.views = [{ rightToLeft: true }];
    const buffer = await workbook.xlsx.writeBuffer();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const safeInstName = instName.replace(new RegExp('[\\s/\\\\]+', 'g'), '_');
    link.setAttribute("download", `قالب_تسجيل_الطلاب_${safeInstName}.xlsx`);
    document.body.appendChild(link); 
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  private async fetchAllStudentsForExport(): Promise<Student[]> {
    const pageSize = 100;
    const students: Student[] = [];
    let totalPages = 1;

    for (let page = 1; page <= totalPages; page++) {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
        sortBy: 'nameAr',
        sortDirection: 'asc',
      });
      const response = await this.apiService.apiFetch(`/api/students?${params.toString()}`, { headers: this.apiService.headers });
      const payload = await this.apiService.safeJson(response);
      if (!response.ok || !payload) throw new Error('تعذر جلب بيانات الطلاب للتصدير.');

      const pageStudents = Array.isArray(payload)
        ? payload
        : (Array.isArray(payload.data) ? payload.data : (Array.isArray(payload.students) ? payload.students : []));
      students.push(...(pageStudents as Student[]));

      const total = Number(payload.pagination?.total ?? payload.total ?? students.length);
      totalPages = Math.max(1, Number(payload.pagination?.totalPages ?? Math.ceil(total / pageSize)));
    }

    return students;
  }

  async exportStudents(): Promise<void> {
    if (this.isExportingStudents()) return;
    this.isExportingStudents.set(true);

    try {
      const activeInstitutionId = this.apiService.selectedInstitutionId() || '';
      if (!this.apiService.institutions().length) await this.apiService.loadInstitutions();
      if (!this.apiService.classes().length) await this.apiService.loadClasses();
      if (!this.apiService.publicLookups()?.['genders']?.length) await this.apiService.loadPublicLookups();
      const institution = this.apiService.institutions().find((item: any) => item.id === activeInstitutionId)
        || this.apiService.institution();
      const schoolCode = String(institution?.schoolCode ?? '').trim();
      const students = await this.fetchAllStudentsForExport();
      const classesById = new Map(this.apiService.classes().map((item) => [item.id, item]));
      const genders = (this.apiService.publicLookups()?.['genders'] || this.apiService.lookups()?.genders || []) as Array<{ id: string; genderCode?: string }>;
      const genderCodes = new Map(genders.map((item) => [item.id, item.genderCode || '']));

      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Students');
      worksheet.columns = [
        { header: 'nationalId', key: 'nationalId', width: 18 },
        { header: 'firstNameAr', key: 'firstNameAr', width: 18 },
        { header: 'lastNameAr', key: 'lastNameAr', width: 18 },
        { header: 'firstNameHe', key: 'firstNameHe', width: 18 },
        { header: 'lastNameHe', key: 'lastNameHe', width: 18 },
        { header: 'birthDate', key: 'birthDate', width: 16 },
        { header: 'genderCode', key: 'genderCode', width: 14 },
        { header: 'schoolCode', key: 'schoolCode', width: 16 },
        { header: 'classCode', key: 'classCode', width: 14 },
      ];
      worksheet.addRows(students.map((student) => ({
        nationalId: String(student.nationalId || ''),
        firstNameAr: student.firstNameAr || '',
        lastNameAr: student.lastNameAr || '',
        firstNameHe: student.firstNameHe || '',
        lastNameHe: student.lastNameHe || '',
        birthDate: student.birthDate ? String(student.birthDate).slice(0, 10) : '',
        genderCode: genderCodes.get(student.genderId || '') || '',
        schoolCode,
        classCode: student.classId ? (classesById.get(student.classId)?.classCode || '') : '',
      })));
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123B82' } };
      worksheet.getColumn(1).numFmt = '@';
      worksheet.views = [{ rightToLeft: true }];
      worksheet.autoFilter = { from: 'A1', to: 'I1' };

      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `سجل_الطلاب_${schoolCode || 'المدرسة'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      this.showToast('success', `تم تصدير ${students.length} طالبًا بنجاح.`);
    } catch (error) {
      console.error('Failed to export students', error);
      this.showToast('error', error instanceof Error ? error.message : 'تعذر تصدير بيانات الطلاب.');
    } finally {
      this.isExportingStudents.set(false);
    }
  }

  importExcel(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    this.importErrors.set([]);

    const activeInstId = this.apiService.selectedInstitutionId();
    if (!activeInstId) {
      this.showToast('error', 'يرجى تحديد مدرسة أولاً من الشريط العلوي قبل القيام بالاستيراد.');
      target.value = '';
      return;
    }

    const activeInst = this.apiService.institutions().find((i) => i.id === activeInstId);
    const activeInstName = activeInst ? activeInst.nameAr : 'المدرسة النشطة';

    const reader = new FileReader();
    reader.onload = async (e: ProgressEvent<FileReader>) => {
      try {
        const buffer = (e.target?.result as ArrayBuffer) || new ArrayBuffer(0);
        const isExcel = /\.(xlsx|xls)$/i.test(file.name);
        let lines: string[];

        if (isExcel) {
          const ExcelJS = await import('exceljs');
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.load(buffer);
          const worksheet = workbook.worksheets[0];
          if (!worksheet) throw new Error('الملف لا يحتوي على ورقة عمل.');
          lines = [];
          const headerValues = worksheet.getRow(1).values as unknown as unknown[];
          worksheet.eachRow({ includeEmpty: false }, (row) => {
            const values = Array.isArray(row.values) ? row.values.slice(1) : [];
            lines.push(values.map((value, columnIndex) => {
              const headerValue = headerValues[columnIndex + 1];
              const normalizedValue = String(headerValue ?? '').trim() === 'birthDate'
                ? this.formatExcelDate(value)
                : String(value ?? '');
              return `"${normalizedValue.replace(/"/g, '""')}"`;
            }).join(','));
          });
        } else {
          const text = new TextDecoder('utf-8').decode(buffer);
          lines = text.split(/\r?\n/);
        }
        
        if (lines.length === 0 || !lines[0].trim()) {
          this.importErrors.set(['ملف الاستيراد فارغ ولا يحتوي على أي صفوف بيانات للطلاب.']);
          this.showToast('error', 'فشل الاستيراد: الملف فارغ.');
          target.value = '';
          return;
        }

        let headerLine = lines[0].trim();
        if (headerLine.startsWith('\uFEFF')) {
          headerLine = headerLine.substring(1);
        }

        const headers = headerLine.split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
        const requiredHeaders = ['firstNameAr', 'lastNameAr', 'institutionId'];
        const optionalHeaders = ['nationalId', 'classId', 'classCode', 'gradeCode', 'parallelNumber', 'firstNameHe', 'lastNameHe', 'birthDate', 'genderCode'];
        const missingHeaders = requiredHeaders.filter(rh => !headers.includes(rh));

        if (missingHeaders.length > 0) {
          this.importErrors.set([
            `ترويسة ملف Excel/CSV غير صالحة. الأعمدة الإلزامية التالية مفقودة: ${missingHeaders.join(', ')}`,
            `الأعمدة الإلزامية: ${requiredHeaders.join(', ')}. الأعمدة الاختيارية: ${optionalHeaders.join(', ')}`
          ]);
          this.showToast('error', 'فشل الاستيراد: أعمدة غير متطابقة.');
          target.value = '';
          return;
        }

        const errors: string[] = [];
        const validRows: any[] = [];

        // Fetch once for the active tenant/year, then resolve every row in memory.
        await this.apiService.loadClasses();
        const activeAcademicYearId = this.apiService.selectedAcademicYearId()
          || this.apiService.academicYears().find((year: any) => year.isCurrent)?.id
          || this.apiService.academicYears()[0]?.id
          || '';
        const activeClasses = this.apiService.classes().filter((item: any) =>
          item.institutionId === activeInstId &&
          item.academicYearId === activeAcademicYearId &&
          item.archivedAt == null
        );
        const classCodeToId = new Map<string, string>();
        const classIds = new Set<string>();
        for (const classItem of activeClasses) {
          classIds.add(classItem.id);
          const fallbackCode = classItem.gradeLevelInfo?.codeNumber != null
            ? `${classItem.gradeLevelInfo.codeNumber}-${classItem.parallelNumber}`
            : '';
          const classCode = this.normalizeImportedClassCode(classItem.classCode || fallbackCode);
          if (classCode) classCodeToId.set(classCode, classItem.id);
        }

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
          const rowObj: Record<string, string> = {};
          headers.forEach((h, idx) => {
            rowObj[h] = cols[idx] || '';
          });

          const rowNum = i + 1;

          if (!rowObj['firstNameAr']) {
            errors.push(`السطر ${rowNum}: الاسم الأول بالعربية (firstNameAr) حقل مطلوب.`);
          }

          if (!rowObj['lastNameAr']) {
            errors.push(`السطر ${rowNum}: اسم العائلة بالعربية (lastNameAr) حقل مطلوب.`);
          }

          if (!rowObj['nationalId']) {
            errors.push(`السطر ${rowNum}: رقم الهوية (nationalId) حقل مطلوب للمطابقة أو الإضافة.`);
          }

          if (!rowObj['institutionId']) {
            errors.push(`السطر ${rowNum}: رمز المؤسسة (institutionId) حقل مطلوب.`);
          } else if (rowObj['institutionId'] !== activeInstId) {
            errors.push(
              `السطر ${rowNum}: المدرسة المحددة في السجل هي (${rowObj['institutionId']})، وهذا لا يطابق مدرسة الشريط العلوي النشطة حالياً "${activeInstName}" ذات الرمز (${activeInstId}). الرجاء تصحيح الرمز للمطابقة.`
            );
          }

          const providedClassCode = this.normalizeImportedClassCode(rowObj['classCode']);
          const gradeCode = String(rowObj['gradeCode'] || '').trim();
          const parallelNumber = String(rowObj['parallelNumber'] || '').trim();
          const combinedClassCode = providedClassCode || (gradeCode && parallelNumber ? `${Number(gradeCode)}-${Number(parallelNumber)}` : '');
          if (rowObj['classId']) {
            if (!classIds.has(rowObj['classId'])) {
              errors.push(`السطر ${rowNum}: classId (${rowObj['classId']}) غير موجود في المؤسسة والسنة الدراسية النشطة.`);
            }
          } else if (combinedClassCode) {
            const resolvedClassId = classCodeToId.get(combinedClassCode);
            if (!resolvedClassId) {
              errors.push(`السطر ${rowNum}: classCode (${combinedClassCode}) غير موجود في السنة الدراسية النشطة. استخدم classCode صحيحًا أو gradeCode مع parallelNumber.`);
            } else {
              rowObj['classId'] = resolvedClassId;
              rowObj['classCode'] = combinedClassCode;
            }
          } else {
            errors.push(`السطر ${rowNum}: يجب تحديد classId أو classCode أو الجمع بين gradeCode وparallelNumber.`);
          }

          const rawBirthDate = rowObj['birthDate']?.trim();
          if (rawBirthDate) {
            const normalizedBirthDate = this.normalizeImportedDate(rawBirthDate);
            if (!normalizedBirthDate) {
              errors.push(`Row ${rowNum}: birthDate must use the format dd/mm/yyyy.`);
            } else {
              rowObj['birthDate'] = normalizedBirthDate;
            }
          }

          const rawGenderCode = rowObj['genderCode']?.trim().toLowerCase();
          if (rawGenderCode) {
            const gender = (this.apiService.lookups()?.genders ?? [])
              .find((item: any) => item.genderCode === rawGenderCode);
            if (!gender) errors.push(`السطر ${rowNum}: genderCode يجب أن يطابق رمز جنس موجوداً، والقيم المسموحة حالياً m أو f.`);
            else rowObj['genderId'] = gender.id;
          }

          if (errors.length < 50) {
            validRows.push(rowObj);
          } else {
            errors.push('تنبيه: تم إيقاف عملية التحقق لكثرة الأخطاء المكتشفة في الملف (أكثر من 50 خطأ).');
            break;
          }
        }

        if (errors.length > 0) {
          this.importErrors.set(errors);
          this.showToast('error', 'فشل استيراد قالب الطلاب: تم العثور على أخطاء في البيانات.');
          target.value = '';
          return;
        }

        if (validRows.length === 0) {
          this.importErrors.set(['لم نتمكن من العثور على أي بيانات طلاب صالحة للاستيراد في الملف.']);
          this.showToast('error', 'فشل الاستيراد: لا توجد بيانات طلاب.');
          target.value = '';
          return;
        }

        // Load the complete list so existing students can be updated by national ID.
        await this.apiService.loadAllStudents();
        const existingStudentsByNationalId = new Map(
          this.studentStateService.students()
            .filter((student: any) => student.nationalId)
            .map((student: any) => [String(student.nationalId).trim(), student])
        );
        let addedCount = 0;
        let updatedCount = 0;
        for (const row of validRows) {
          const rowNationalId = String(row.nationalId || '').trim();
          const existingStudent = rowNationalId ? existingStudentsByNationalId.get(rowNationalId) : undefined;

          const payload = {
            // Keep the database value when updating an existing student.
            nationalId: existingStudent?.nationalId || row.nationalId || null,
            firstNameAr: row.firstNameAr,
            lastNameAr: row.lastNameAr,
            firstNameHe: row.firstNameHe || null,
            lastNameHe: row.lastNameHe || null,
            institutionId: activeInstId,
            classId: row.classId,
            studentStatusId: this.apiService.lookups()?.studentStatuses?.find((status: any) => status.isActive)?.id || '',
            genderId: row.genderId || null,
            birthDate: row.birthDate || null,
            isActive: true,
            notes: 'تم استيراد الطالب بنجاح عبر نظام استيراد CSV'
          };
          const ok = existingStudent
            ? await firstValueFrom(this.studentStateService.updateStudent(existingStudent.id, payload))
            : await firstValueFrom(this.studentStateService.createStudent(payload));
          if (ok) {
            if (existingStudent) updatedCount++;
            else addedCount++;
          }
        }

        this.showToast('success', `تمت معالجة الملف: تحديث ${updatedCount} طالب وإضافة ${addedCount} طالب جديد.`);
        this.importErrors.set([]);

      } catch (err: any) {
        console.error('Import process error:', err);
        this.importErrors.set([`حدث خطأ أثناء قراءة ومعالجة الملف: ${err.message || err}`]);
        this.showToast('error', 'فشل معالجة واستيراد ملف الطلاب.');
      } finally {
        target.value = '';
      }
    };

    reader.onerror = () => {
      this.importErrors.set(['فشل قراءة الملف من الجهاز. الرجاء التأكد من أن الملف ليس تالفاً ومغلقاً في البرامج الأخرى.']);
      this.showToast('error', 'فشل قراءة ملف الاستيراد.');
      target.value = '';
    };

    reader.readAsArrayBuffer(file);
  }
}
