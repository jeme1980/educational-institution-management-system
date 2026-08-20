import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ApiService, ClassItem } from '../../../core/services/api.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { UiSelectComponent } from '../../../shared/components/select/ui-select.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-enrollments',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, UiSelectComponent],
  templateUrl: './enrollments.component.html',
  styleUrl: './enrollments.component.css'
})
export class EnrollmentsComponent implements OnInit {
  apiService = inject(ApiService);
  confirmDialog = inject(ConfirmDialogService);
  fb = inject(FormBuilder);

  Math = Math;

  // Split-layout view signals
  selectedYear = signal<string>('2024-2025');
  selectedGrade = signal<string>('');
  selectedClassroomId = signal<string>('');

  candidateSearch = signal<string>('');
  selectedCandidateIds = signal<Set<string>>(new Set());

  enrolledSearch = signal<string>('');
  selectedEnrolledIds = signal<Set<string>>(new Set());

  isProcessing = signal<boolean>(false);

  // Modal-based manual action signals
  showModal = signal<boolean>(false);
  showTransferModal = signal<boolean>(false);
  isEditing = signal<boolean>(false);
  editingId = signal<string | null>(null);

  // Toast signal
  toast = signal<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  enrollmentForm = this.fb.group({
    studentId: ['', [Validators.required]],
    classRoomId: ['', [Validators.required]],
    studentFeatureId: [''],
    startDate: [this.getTodayString(), [Validators.required]],
    endDate: [''],
    isActive: [true],
    notes: [''],
  });

  getTodayString() {
    return new Date().toISOString().split('T')[0];
  }

  formatDate(d: string | null) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('ar-EG');
  }

  getClassGradeLabel(classItem: ClassItem): string {
    return classItem.gradeLevel || classItem.gradeLevelInfo?.nameAr || classItem.gradeLevelId || 'غير محدد';
  }

  showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
    this.toast.set({ message, type });
    setTimeout(() => {
      if (this.toast()?.message === message) {
        this.toast.set(null);
      }
    }, 4000);
  }

  async ngOnInit() {
    await this.apiService.loadAcademicYears();

    const years = this.apiService.academicYears() || [];
    const currentYear = years.find(y => y.isCurrent) || years[0];
    if (currentYear) {
      this.selectedYear.set(currentYear.id);
      this.apiService.setSelectedAcademicYearId(currentYear.id);
    }

    await Promise.all([
      this.apiService.loadEnrollments(),
      this.apiService.loadAllStudents(),
      this.apiService.loadClasses(),
    ]);

    const classes = this.apiService.classes() || [];
    const yearId = this.selectedYear();
    const yearClasses = classes.filter(c => c.academicYearId === yearId);

    if (yearClasses.length > 0) {
      this.selectedGrade.set(this.getClassGradeLabel(yearClasses[0]));
      this.selectedClassroomId.set(yearClasses[0].id);
    } else if (classes.length > 0) {
      this.selectedGrade.set(this.getClassGradeLabel(classes[0]));
      this.selectedClassroomId.set(classes[0].id);
    }
  }

  // Dashboard & Metrics
  totalActiveEnrollments = computed(() => {
    const list = this.apiService.enrollments() || [];
    const yearId = this.selectedYear();
    const classes = this.apiService.classes() || [];
    const yearClassIds = new Set(classes.filter(c => c.academicYearId === yearId).map(c => c.id));
    return list.filter(item => item.enrollment.isActive && yearClassIds.has(item.enrollment.classId)).length;
  });

  totalUnassignedStudents = computed(() => {
    return this.unenrolledStudents().length;
  });

  averageOccupancyRate = computed(() => {
    const classes = this.apiService.classes() || [];
    const yearId = this.selectedYear();
    const yearClasses = classes.filter(c => c.academicYearId === yearId);
    if (yearClasses.length === 0) return 0;

    const enrollments = this.apiService.enrollments() || [];
    const yearClassIds = new Set(yearClasses.map(c => c.id));
    const yearEnrollmentsCount = enrollments.filter(item => yearClassIds.has(item.enrollment.classId)).length;

    const totalCapacity = yearClasses.length * 30;
    return Math.min(100, Math.round((yearEnrollmentsCount / totalCapacity) * 100));
  });

  fullClassesCount = computed(() => {
    const classes = this.apiService.classes() || [];
    const yearId = this.selectedYear();
    const yearClasses = classes.filter(c => c.academicYearId === yearId);
    const enrollments = this.apiService.enrollments() || [];
    
    let count = 0;
    for (const c of yearClasses) {
      const classEnrolled = enrollments.filter(item => item.enrollment.classId === c.id).length;
      if (classEnrolled >= 30) {
        count++;
      }
    }
    return count;
  });

  getInitials(first: string | undefined, last: string | undefined): string {
    const f = first ? first.trim().charAt(0) : '';
    const l = last ? last.trim().charAt(0) : '';
    return f || l ? `${f} ${l}` : 'ط';
  }

  getAvatarBg(id: string): string {
    const colors = [
      'bg-slate-100 text-slate-700 border-slate-200',
      'bg-blue-50 text-[#00236f] border-blue-100',
      'bg-emerald-50 text-emerald-700 border-emerald-100',
      'bg-amber-50 text-amber-700 border-amber-100',
      'bg-rose-50 text-rose-700 border-rose-100',
      'bg-violet-50 text-violet-700 border-violet-100',
      'bg-teal-50 text-teal-700 border-teal-100'
    ];
    let sum = 0;
    for (let i = 0; i < id.length; i++) {
      sum += id.charCodeAt(i);
    }
    return colors[sum % colors.length];
  }

  availableGrades = computed(() => {
    const classes = this.apiService.classes() || [];
    const yearId = this.selectedYear();
    const filteredByYear = yearId ? classes.filter(c => c.academicYearId === yearId) : classes;
    const grades = filteredByYear.map(c => this.getClassGradeLabel(c)).filter(Boolean);
    return Array.from(new Set(grades)).sort((a, b) => {
      return a.localeCompare(b, undefined, { numeric: true });
    });
  });

  availableGradesInYear = computed(() => this.availableGrades());

  filteredClasses = computed(() => {
    const list = this.apiService.classes() || [];
    const yearId = this.selectedYear();
    const grade = this.selectedGrade();

    const filtered = list.filter(c => {
      const matchesYear = !yearId || c.academicYearId === yearId;
      const matchesGrade = !grade || this.getClassGradeLabel(c) === grade;
      return matchesYear && matchesGrade;
    });

    return [...filtered].sort((a, b) => {
      return (a.nameAr || '').localeCompare(b.nameAr || '', 'ar');
    });
  });

  classesFilteredByGrade = computed(() => this.filteredClasses());

  currentClassroom = computed(() => {
    const list = this.apiService.classes() || [];
    const classId = this.selectedClassroomId();
    return list.find(c => c.id === classId) || null;
  });

  allClassesInSameYear = computed(() => {
    const list = this.apiService.classes() || [];
    const yearId = this.selectedYear();
    return list.filter(c => c.academicYearId === yearId && c.id !== this.selectedClassroomId());
  });

  enrolledInSelectedClass = computed(() => {
    const enrollments = this.apiService.enrollments() || [];
    const classId = this.selectedClassroomId();
    if (!classId) return [];
    return enrollments.filter(item => item.enrollment.classId === classId);
  });

  currentClassroomCount = computed(() => this.enrolledInSelectedClass().length);

  filteredEnrolled = computed(() => {
    const list = this.enrolledInSelectedClass();
    const term = this.enrolledSearch().trim().toLowerCase();
    
    const filtered = term ? list.filter(item => {
      const s = item.student;
      const name = `${s?.firstNameAr || ''} ${s?.lastNameAr || ''}`.toLowerCase();
      const nationalId = (s?.nationalId || '').toLowerCase();
      const phone = (s?.phoneNumber || '').toLowerCase();
      return name.includes(term) || nationalId.includes(term) || phone.includes(term);
    }) : list;

    return [...filtered].sort((a, b) => {
      const nameA = `${a.student?.firstNameAr || ''} ${a.student?.lastNameAr || ''}`;
      const nameB = `${b.student?.firstNameAr || ''} ${b.student?.lastNameAr || ''}`;
      return nameA.localeCompare(nameB, 'ar');
    });
  });

  filteredEnrolledInClassroom = computed(() => this.filteredEnrolled());

  unenrolledStudents = computed(() => {
    const students = this.apiService.students() || [];
    const enrollments = this.apiService.enrollments() || [];
    
    const activeEnrolledStudentIds = new Set(
      enrollments
        .filter(item => item.enrollment.isActive)
        .map(item => item.enrollment.studentId)
    );

    return students.filter(s => !activeEnrolledStudentIds.has(s.id));
  });

  filteredCandidates = computed(() => {
    const list = this.unenrolledStudents();
    const term = this.candidateSearch().trim().toLowerCase();

    const filtered = list.filter(s => {
      if (!term) return true;
      const name = `${s.firstNameAr || ''} ${s.lastNameAr || ''}`.toLowerCase();
      const nationalId = (s.nationalId || '').toLowerCase();
      const phone = (s.phoneNumber || '').toLowerCase();
      return name.includes(term) || nationalId.includes(term) || phone.includes(term);
    });

    return [...filtered].sort((a, b) => {
      const nameA = `${a.firstNameAr || ''} ${a.lastNameAr || ''}`;
      const nameB = `${b.firstNameAr || ''} ${b.lastNameAr || ''}`;
      return nameA.localeCompare(nameB, 'ar');
    });
  });

  // The manual enrollment dialog must only offer students that are not
  // actively enrolled in the selected academic year.
  availableStudentsForEnrollment = computed(() => {
    const enrolledIds = new Set(
      (this.apiService.enrollments() || [])
        .filter(item => item.enrollment.isActive)
        .map(item => item.enrollment.studentId),
    );
    return (this.apiService.students() || [])
      .filter(student => !enrolledIds.has(student.id))
      .sort((a, b) => `${a.firstNameAr} ${a.lastNameAr}`.localeCompare(`${b.firstNameAr} ${b.lastNameAr}`, 'ar'));
  });

  availableClassesForEnrollment = computed(() => {
    const currentClassId = this.enrollmentForm.getRawValue().classRoomId;
    const currentClass = (this.apiService.classes() || []).find(item => item.id === currentClassId);
    const classes = [...this.filteredClasses()];
    if (currentClass && !classes.some(item => item.id === currentClass.id)) classes.push(currentClass);
    return classes.sort((a, b) => (a.nameAr || '').localeCompare(b.nameAr || '', 'ar'));
  });

  enrollmentStudentOptions(): any[] {
    if (!this.isEditing()) return this.availableStudentsForEnrollment();
    const studentId = this.enrollmentForm.getRawValue().studentId;
    const student = (this.apiService.students() || []).find(item => item.id === studentId);
    return student ? [student] : [];
  }

  selectedClassroom = computed(() => this.currentClassroom());

  onGradeChange(gradeOrEvent: string | Event) {
    const grade = typeof gradeOrEvent === 'string' ? gradeOrEvent : ((gradeOrEvent.target as HTMLSelectElement)?.value || '');
    this.selectedGrade.set(grade);
    const classes = this.apiService.classes() || [];
    const yearId = this.selectedYear();
    const matching = classes.filter(c => {
      const matchesYear = !yearId || c.academicYearId === yearId;
      return matchesYear && this.getClassGradeLabel(c) === grade;
    });
    if (matching.length > 0) {
      this.selectedClassroomId.set(matching[0].id);
    } else {
      this.selectedClassroomId.set('');
    }
    this.selectedEnrolledIds.set(new Set());
  }

  async onYearChange(e: Event) {
    const yearId = (e.target as HTMLSelectElement).value;
    this.selectedYear.set(yearId);
    this.apiService.setSelectedAcademicYearId(yearId || null);
    await Promise.all([
      this.apiService.loadEnrollments(),
      this.apiService.loadClasses(),
    ]);
    
    const classes = this.apiService.classes() || [];
    const filteredByYear = classes.filter(c => c.academicYearId === yearId);
    const grades = Array.from(new Set(filteredByYear.map(c => this.getClassGradeLabel(c)).filter(Boolean))).sort((a, b) => {
      return a.localeCompare(b, undefined, { numeric: true });
    });
    
    if (grades.length > 0) {
      const currentGrade = this.selectedGrade();
      const nextGrade = grades.includes(currentGrade) ? currentGrade : grades[0];
      this.onGradeChange(nextGrade);
    } else {
      this.selectedGrade.set('');
      this.selectedClassroomId.set('');
    }
    this.selectedEnrolledIds.set(new Set());
  }

  toggleEnrolledSelection(id: string) {
    const current = new Set(this.selectedEnrolledIds());
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    this.selectedEnrolledIds.set(current);
  }

  toggleAllEnrolled(checked: boolean) {
    if (checked) {
      const allIds = this.filteredEnrolled().map(item => item.enrollment.id);
      this.selectedEnrolledIds.set(new Set(allIds));
    } else {
      this.selectedEnrolledIds.set(new Set());
    }
  }

  areAllEnrolledSelected(): boolean {
    const filtered = this.filteredEnrolled();
    if (filtered.length === 0) return false;
    return filtered.every(item => this.selectedEnrolledIds().has(item.enrollment.id));
  }

  isAllEnrolledSelected(): boolean {
    return this.areAllEnrolledSelected();
  }

  toggleSelectAllEnrolled() {
    this.toggleAllEnrolled(!this.areAllEnrolledSelected());
  }

  toggleCandidateSelection(id: string) {
    const current = new Set(this.selectedCandidateIds());
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    this.selectedCandidateIds.set(current);
  }

  toggleAllCandidates(checked: boolean) {
    if (checked) {
      const allIds = this.filteredCandidates().map(s => s.id);
      this.selectedCandidateIds.set(new Set(allIds));
    } else {
      this.selectedCandidateIds.set(new Set());
    }
  }

  areAllCandidatesSelected(): boolean {
    const filtered = this.filteredCandidates();
    if (filtered.length === 0) return false;
    return filtered.every(s => this.selectedCandidateIds().has(s.id));
  }

  isAllCandidatesSelected(): boolean {
    return this.areAllCandidatesSelected();
  }

  toggleSelectAllCandidates() {
    this.toggleAllCandidates(!this.areAllCandidatesSelected());
  }

  async enrollSelectedCandidates() {
    const classId = this.selectedClassroomId();
    if (!classId) return;
    const selectedIds = Array.from(this.selectedCandidateIds());
    if (selectedIds.length === 0) return;

    this.isProcessing.set(true);
    let count = 0;
    const errors: string[] = [];
    
    for (const studentId of selectedIds) {
      const res = await this.apiService.createEnrollment({
        studentId,
        classRoomId: classId,
        startDate: this.getTodayString(),
        isActive: true,
        notes: 'تم الإلحاق الجماعي من لوحة إدارة القيد'
      });
      if (res.success) {
        count++;
      } else if (res.error) {
        errors.push(res.error);
      }
    }

    await this.apiService.loadEnrollments();
    this.selectedCandidateIds.set(new Set());
    this.isProcessing.set(false);
    if (count === selectedIds.length) {
      this.showToast(`تم إلحاق عدد ${count} طلاب بنجاح بالشعبة المحددة`, 'success');
    } else if (count > 0) {
      this.showToast(`تم إلحاق ${count} من أصل ${selectedIds.length} طالب فقط. بعض الطلاب لم يتم إلحاقهم.`, 'info');
    } else {
      this.showToast('لم يتم إلحاق أي طالب. تحقق من الشعبة والسجلات الحالية.', 'error');
    }
  }

  batchEnrollCandidates() {
    return this.enrollSelectedCandidates();
  }

  enrollSingleStudent(id: string) {
    this.selectedCandidateIds.set(new Set([id]));
    return this.enrollSelectedCandidates();
  }

  async cancelEnrollment(enrollmentId: string) {
    if (await this.confirmDialog.confirm({ title: 'إلغاء قيد الطالب', message: 'هل أنت متأكد من إلغاء قيد هذا الطالب من هذه الشعبة الدراسية نهائياً؟', variant: 'danger' })) {
      this.isProcessing.set(true);
      const res = await this.apiService.deleteEnrollment(enrollmentId);
      this.isProcessing.set(false);
      if (res) {
        this.showToast('تم إلغاء قيد الطالب بنجاح', 'success');
      } else {
        this.showToast('فشل إلغاء القيد، يرجى المحاولة لاحقاً', 'error');
      }
    }
  }

  deleteEnrollment(id: string) {
    return this.cancelEnrollment(id);
  }

  async batchCancelEnrollments() {
    const selectedIds = Array.from(this.selectedEnrolledIds());
    if (selectedIds.length === 0) return;
    
    if (await this.confirmDialog.confirm({ title: 'إلغاء قيود الطلاب', message: `هل أنت متأكد من إلغاء قيد عدد ${selectedIds.length} من الطلاب المحددين نهائياً؟`, variant: 'danger' })) {
      this.isProcessing.set(true);
      let successCount = 0;
      for (const id of selectedIds) {
        const res = await this.apiService.deleteEnrollment(id);
        if (res) successCount++;
      }
      this.selectedEnrolledIds.set(new Set());
      this.isProcessing.set(false);
      this.showToast(`تم إلغاء قيد ${successCount} طالب بنجاح من الشعبة`, 'success');
    }
  }

  batchUnenroll() {
    return this.batchCancelEnrollments();
  }

  async batchTransferEnrollments(targetClassroomId: string) {
    if (!targetClassroomId) return;
    const selectedIds = Array.from(this.selectedEnrolledIds());
    if (selectedIds.length === 0) return;

    this.isProcessing.set(true);
    const enrollments = this.apiService.enrollments() || [];
    
    let successCount = 0;
    for (const enrollmentId of selectedIds) {
      const item = enrollments.find(e => e.enrollment.id === enrollmentId);
      if (item) {
        const res = await this.apiService.updateEnrollment(enrollmentId, {
          ...item.enrollment,
          classRoomId: targetClassroomId,
          notes: `نقل جماعي للشعبة الدراسية في ${this.getTodayString()}`
        });
        if (res.success) successCount++;
      }
    }

    await this.apiService.loadEnrollments();
    this.selectedEnrolledIds.set(new Set());
    this.showTransferModal.set(false);
    this.isProcessing.set(false);
    this.showToast(`تم نقل ${successCount} طالب بنجاح إلى الشعبة الجديدة`, 'success');
  }

  exportEnrolledList() {
    const list = this.filteredEnrolled();
    if (list.length === 0) {
      this.showToast('لا توجد بيانات متاحة للتصدير في هذه الشعبة', 'info');
      return;
    }
    const csvContent = "data:text/csv;charset=utf-8," 
      + ["رقم القيد,اسم الطالب,الصف,الحالة,تاريخ القيد"].join(",") + "\n"
      + list.map(item => [
          item.enrollment.enrollmentNumber || '-',
          `"${item.student?.firstNameAr || ''} ${item.student?.lastNameAr || ''}"`,
          `"${item.classRoom?.nameAr || ''}"`,
          item.enrollment.isActive ? 'نشط' : 'غير نشط',
          item.enrollment.startDate ? item.enrollment.startDate.split('T')[0] : '-'
        ].join(",")).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `قائمة_طلاب_الصف_${this.currentClassroom()?.nameAr || 'المحدد'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.showToast('تم تصدير قوائم الطلاب المقيدين بنجاح', 'success');
  }

  openCreateModal() {
    this.isEditing.set(false);
    this.editingId.set(null);
    this.enrollmentForm.reset({
      studentId: '',
      classRoomId: this.selectedClassroomId(),
      studentFeatureId: '',
      startDate: this.getTodayString(),
      endDate: '',
      isActive: true,
      notes: '',
    });
    this.enrollmentForm.get('studentId')?.enable();
    this.showModal.set(true);
  }

  openEditModal(item: any) {
    this.isEditing.set(true);
    this.editingId.set(item.enrollment.id);
    this.enrollmentForm.patchValue({
      studentId: item.student?.id || '',
      classRoomId: item.classRoom?.id || '',
      studentFeatureId: item.enrollment.studentFeatureId || '',
      startDate: item.enrollment.startDate ? item.enrollment.startDate.split('T')[0] : '',
      endDate: item.enrollment.endDate ? item.enrollment.endDate.split('T')[0] : '',
      isActive: item.enrollment.isActive,
      notes: item.enrollment.notes || '',
    });
    this.enrollmentForm.get('studentId')?.disable();
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.enrollmentForm.get('studentId')?.enable();
  }

  async saveEnrollment() {
    if (this.enrollmentForm.invalid) {
      this.enrollmentForm.markAllAsTouched();
      return;
    }

    this.isProcessing.set(true);
    const val = this.enrollmentForm.getRawValue();

    if (this.isEditing() && this.editingId()) {
      // The update endpoint accepts only editable enrollment fields. Normalize
      // empty date/select values before validation instead of sending HTML
      // form empty strings as dates or UUIDs.
      const updatePayload = {
        classRoomId: val.classRoomId || undefined,
        studentFeatureId: val.studentFeatureId || null,
        startDate: val.startDate || null,
        endDate: val.endDate || null,
        isActive: Boolean(val.isActive),
        notes: val.notes || null,
      };
      const res = await this.apiService.updateEnrollment(this.editingId()!, updatePayload);
      if (res.success) {
        this.closeModal();
        this.showToast('تم تحديث سجل قيد الطالب بنجاح', 'success');
      } else {
        this.showToast(res.error || 'عذراً، فشل تحديث سجل القيد', 'error');
      }
    } else {
      const res = await this.apiService.createEnrollment(val);
      if (res.success) {
        this.closeModal();
        this.showToast('تم تسجيل وإلحاق الطالب بنجاح بالشعبة المحددة', 'success');
      } else {
        this.showToast(res.error || 'عذراً، فشل تسجيل الطالب الجديد', 'error');
      }
    }
    this.isProcessing.set(false);
  }
}
