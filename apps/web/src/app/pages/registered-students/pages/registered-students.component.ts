import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../core/services/api.service';

@Component({
  selector: 'app-registered-students',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './registered-students.component.html',
  styleUrl: './registered-students.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisteredStudentsComponent implements OnInit {
  readonly api = inject(ApiService);
  readonly search = signal('');
  readonly classCodeFilter = signal('');
  readonly genderId = signal('');
  readonly featureId = signal('');
  readonly editingId = signal<string | null>(null);
  readonly editClassId = signal('');
  readonly editFeatureId = signal('');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly saving = signal(false);
  readonly toast = signal<{ message: string; type: 'success' | 'error' } | null>(null);

  readonly year = computed(() => this.api.academicYears().find(item => item.id === this.api.selectedAcademicYearId()) || null);
  readonly institution = computed(() => this.api.institutions().find(item => item.id === this.api.selectedInstitutionId()) || null);
  readonly classes = computed(() => this.api.classes().filter(item => item.academicYearId === this.api.selectedAcademicYearId()));
  readonly classCodes = computed(() => this.classes()
    .map(item => item.classCode || (item.gradeLevelInfo?.codeNumber != null ? `${item.gradeLevelInfo.codeNumber}-${item.parallelNumber}` : ''))
    .filter((code, index, list) => code && list.indexOf(code) === index)
    .sort((first, second) => this.compareClassCodes(first, second)));
  readonly genders = computed(() => (this.api.lookups()?.genders || []).filter((item: any) => item.isActive !== false));
  readonly features = computed(() => (this.api.lookups()?.studentFeatures || []).filter((item: any) => item.isActive !== false));
  readonly rows = computed(() => {
    const term = this.search().trim().toLowerCase();
    const filtered = (this.api.enrollments() || []).filter(item => {
      const student: any = item.student;
      const enrollment: any = item.enrollment;
      const matchesSearch = !term || `${student?.firstNameAr || ''} ${student?.lastNameAr || ''}`.toLowerCase().includes(term) || String(student?.nationalId || '').toLowerCase().includes(term);
      const matchesClassCode = !this.classCodeFilter() || this.classCode(item) === this.classCodeFilter();
      const matchesGender = !this.genderId() || student?.genderId === this.genderId();
      const matchesFeature = !this.featureId() || enrollment?.studentFeatureId === this.featureId();
      return enrollment?.academicYearId === this.api.selectedAcademicYearId() && !enrollment?.isDeleted && matchesSearch && matchesClassCode && matchesGender && matchesFeature;
    });
    return filtered.sort((a, b) => `${a.student?.firstNameAr || ''} ${a.student?.lastNameAr || ''}`
        .localeCompare(`${b.student?.firstNameAr || ''} ${b.student?.lastNameAr || ''}`, 'ar'));
  });

  async ngOnInit() {
    this.loading.set(true); this.error.set('');
    try { await Promise.all([this.api.loadAcademicYears(), this.api.loadInstitutions(), this.api.loadEnrollments(), this.api.loadClasses(), this.api.loadAllStudents(), this.api.loadLookups()]); }
    catch { this.error.set('تعذر تحميل الطلاب المسجلين.'); }
    finally { this.loading.set(false); }
  }

  openEdit(row: any) { this.editingId.set(row.enrollment.id); this.editClassId.set(row.enrollment.classId || ''); this.editFeatureId.set(row.enrollment.studentFeatureId || ''); }
  cancelEdit() { this.editingId.set(null); }
  getGradeLabel(value: any): string {
    if (typeof value === 'string' && value.trim()) return value;
    if (value && typeof value === 'object' && typeof value.nameAr === 'string') return value.nameAr;
    return 'غير محدد';
  }
  className(row: any) {
    const classRoom = row.classRoom || this.api.classes().find(item => item.id === row.enrollment?.classId);
    return classRoom?.nameAr || 'غير محدد';
  }
  classCode(row: any): string {
    const classRoom: any = row.classRoom || this.api.classes().find(item => item.id === row.enrollment?.classId);
    return classRoom?.classCode
      || (this.getGradeCodeNumber(classRoom) != null
        ? `${this.getGradeCodeNumber(classRoom)}-${classRoom.parallelNumber}`
        : '');
  }
  private getGradeCodeNumber(classRoom: any): number | null {
    return classRoom?.gradeLevelInfo?.codeNumber ?? classRoom?.gradeLevel?.codeNumber ?? null;
  }
  private compareClassCodes(first: string, second: string): number {
    const parse = (value: string): [number, number] => {
      const match = value.match(/^(\d+)\s*-\s*(\d+)$/);
      return match ? [Number(match[1]), Number(match[2])] : [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
    };
    const [firstGrade, firstParallel] = parse(first);
    const [secondGrade, secondParallel] = parse(second);
    return firstGrade - secondGrade || firstParallel - secondParallel || first.localeCompare(second, 'ar');
  }
  gradeName(row: any) { return row.classRoom?.gradeLevelInfo?.nameAr || row.classRoom?.gradeLevel || 'غير محدد'; }
  genderName(row: any) { return this.genders().find((item: any) => item.id === row.student?.genderId)?.nameAr || 'غير محدد'; }
  featureName(row: any) { return row.enrollment?.studentFeature?.nameAr || this.features().find((item: any) => item.id === row.enrollment?.studentFeatureId)?.nameAr || 'بدون ميزة'; }
  showToast(message: string, type: 'success' | 'error') { this.toast.set({ message, type }); setTimeout(() => this.toast.set(null), 3500); }

  async saveEdit() {
    const id = this.editingId(); if (!id || !this.editClassId()) return;
    this.saving.set(true);
    const result = await this.api.updateEnrollment(id, { classRoomId: this.editClassId(), studentFeatureId: this.editFeatureId() || null });
    this.saving.set(false);
    if (result.success) { this.editingId.set(null); this.showToast('تم تحديث الصف وميزة الطالب بنجاح', 'success'); }
    else this.showToast(result.error || 'تعذر تحديث السجل', 'error');
  }
}
