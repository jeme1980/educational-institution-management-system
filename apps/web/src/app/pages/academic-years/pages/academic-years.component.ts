import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ApiService, AcademicYear, AcademicPeriod } from '../../../core/services/api.service';
import { UiModalComponent } from '../../../shared/components/ui-modal/ui-modal.component';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import { UiStatCardComponent } from '../../../shared/components/ui-stat-card/ui-stat-card.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-academic-years',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, UiModalComponent, UiButtonComponent, UiPageHeaderComponent, UiStatCardComponent],
  styles: ['#academic-years-container > .academic-years-legacy-header, #academic-years-container > .academic-years-legacy-metrics { display: none; }'],
  templateUrl: './academic-years.component.html',
  styleUrl: './academic-years.component.css'
})
export class AcademicYearsComponent implements OnInit {
  apiService = inject(ApiService);
  fb = inject(FormBuilder);

  // State Signals
  selectedYear = signal<AcademicYear | null>(null);
  searchQuery = signal<string>('');
  isProcessing = signal<boolean>(false);
  yearsLoading = signal<boolean>(false);
  periodsLoading = signal<boolean>(false);
  yearsLoadError = signal<string | null>(null);
  periodsLoadError = signal<string | null>(null);
  toast = signal<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);

  // Modals visibility
  showYearModal = signal<boolean>(false);
  editingYear = signal<AcademicYear | null>(null);

  showPeriodModal = signal<boolean>(false);
  editingPeriod = signal<AcademicPeriod | null>(null);

  // Confirmation Overlay Signal
  confirmDeleteTarget = signal<{ type: 'year' | 'period', id: string, name: string } | null>(null);

  yearForm!: FormGroup;
  periodForm!: FormGroup;

  // Computeds for Bento Stats
  totalYears = computed(() => this.apiService.academicYears().length);
  activeYearLabel = computed(() => this.currentYear()?.yearLabel || 'غير محدد حالياً');
  closedYearsCount = computed(() => this.apiService.academicYears().filter(y => y.isClosed).length);
  totalPeriodsCount = computed(() => this.apiService.academicPeriods().length);

  currentYear = computed(() => {
    return this.apiService.academicYears().find((y) => y.isCurrent) || null;
  });

  filteredYears = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const list = this.apiService.academicYears();
    if (!query) return list;
    return list.filter((y) => y.yearLabel.toLowerCase().includes(query));
  });

  selectedYearPeriods = computed(() => {
    const year = this.selectedYear();
    if (!year) return [];
    return this.apiService.academicPeriods().filter((p) => p.academicYearId === year.id);
  });

  ngOnInit() {
    this.initForms();
    void this.loadAcademicData();
  }

  private async loadAcademicData(): Promise<void> {
    this.yearsLoading.set(true);
    this.periodsLoading.set(true);
    this.yearsLoadError.set(null);
    this.periodsLoadError.set(null);

    const yearsRequest = this.apiService.loadAcademicYears()
      .catch(() => this.yearsLoadError.set('تعذر تحميل الأعوام الأكاديمية حالياً.'))
      .finally(() => this.yearsLoading.set(false));
    const periodsRequest = this.apiService.loadAcademicPeriods()
      .catch(() => this.periodsLoadError.set('تعذر تحميل الفترات الدراسية حالياً.'))
      .finally(() => this.periodsLoading.set(false));

    await Promise.all([yearsRequest, periodsRequest]);
  }

  initForms() {
    this.yearForm = this.fb.group({
      yearLabel: ['', [Validators.required]],
      startDate: ['', [Validators.required]],
      endDate: ['', [Validators.required]],
      isCurrent: [false],
      isClosed: [false],
    });

    this.periodForm = this.fb.group({
      nameAr: ['', [Validators.required]],
      nameHe: [''],
      startDate: ['', [Validators.required]],
      endDate: ['', [Validators.required]],
      sortOrder: [1],
      isActive: [true],
    }, { validators: this.periodDateValidator() });
  }

  private periodDateValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const startValue = control.get('startDate')?.value;
      const endValue = control.get('endDate')?.value;
      if (!startValue || !endValue) return null;
      const start = new Date(startValue).getTime();
      const end = new Date(endValue).getTime();
      if (Number.isNaN(start) || Number.isNaN(end)) return { invalidPeriodDates: true };
      if (end <= start) return { dateOrder: true };
      const year = this.selectedYear();
      if (!year) return null;
      return start < new Date(year.startDate).getTime() || end > new Date(year.endDate).getTime() ? { yearRange: true } : null;
    };
  }

  // Toast System Helper
  showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
    this.toast.set({ message, type });
    setTimeout(() => {
      if (this.toast()?.message === message) {
        this.toast.set(null);
      }
    }, 4000);
  }

  updateSearch(e: Event) {
    const target = e.target as HTMLInputElement;
    this.searchQuery.set(target.value);
  }

  selectYear(year: AcademicYear) {
    this.selectedYear.set(year);
  }

  formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // Years Actions
  openYearModal(year?: AcademicYear) {
    if (year) {
      this.editingYear.set(year);
      this.yearForm.patchValue({
        yearLabel: year.yearLabel,
        startDate: year.startDate ? new Date(year.startDate).toISOString().split('T')[0] : '',
        endDate: year.endDate ? new Date(year.endDate).toISOString().split('T')[0] : '',
        isCurrent: year.isCurrent,
        isClosed: year.isClosed,
      });
    } else {
      this.editingYear.set(null);
      this.yearForm.reset({
        yearLabel: '',
        startDate: '',
        endDate: '',
        isCurrent: false,
        isClosed: false,
      });
    }
    this.showYearModal.set(true);
  }

  closeYearModal() {
    this.showYearModal.set(false);
    this.editingYear.set(null);
    this.yearForm.reset();
  }

  async saveYear() {
    if (this.yearForm.invalid) {
      this.yearForm.markAllAsTouched();
      return;
    }
    this.isProcessing.set(true);
    const val = this.yearForm.value;

    try {
      if (this.editingYear()) {
        const res = await this.apiService.updateAcademicYear(this.editingYear()!.id, val);
        if (res.success) {
          this.closeYearModal();
          this.showToast('تم تعديل بيانات العام الدراسي بنجاح.', 'success');
          if (this.selectedYear()?.id === this.editingYear()!.id) {
            // Refresh details
            const updated = this.apiService.academicYears().find(y => y.id === this.editingYear()!.id);
            if (updated) this.selectedYear.set(updated);
          }
        } else {
          this.showToast(res.error || 'فشل في حفظ التعديلات.', 'error');
        }
      } else {
        const res = await this.apiService.createAcademicYear(val);
        if (res.success) {
          this.closeYearModal();
          this.showToast('تم إنشاء العام الدراسي الجديد بنجاح.', 'success');
        } else {
          this.showToast(res.error || 'فشل في إنشاء العام الدراسي الجديد.', 'error');
        }
      }
    } catch (e) {
      this.showToast('حدث خطأ غير متوقع أثناء الحفظ.', 'error');
    } finally {
      this.isProcessing.set(false);
    }
  }

  async makeCurrent(year: AcademicYear) {
    if (year.isCurrent || year.isClosed) return;
    this.isProcessing.set(true);
    try {
      const res = await this.apiService.setCurrentAcademicYear(year.id);
      this.showToast(res.success ? 'تم تغيير العام الدراسي الحالي بنجاح.' : (res.error || 'تعذر تغيير العام الدراسي الحالي.'), res.success ? 'success' : 'error');
    } finally {
      this.isProcessing.set(false);
    }
  }

  // Periods Actions
  openPeriodModal(period?: AcademicPeriod) {
    if (!this.selectedYear()) {
      this.showToast('الرجاء اختيار عام دراسي أولاً.', 'info');
      return;
    }

    if (period) {
      this.editingPeriod.set(period);
      this.periodForm.patchValue({
        nameAr: period.nameAr,
        nameHe: period.nameHe,
        startDate: period.startDate ? new Date(period.startDate).toISOString().split('T')[0] : '',
        endDate: period.endDate ? new Date(period.endDate).toISOString().split('T')[0] : '',
        sortOrder: period.sortOrder,
        isActive: period.isActive,
      });
    } else {
      this.editingPeriod.set(null);
      this.periodForm.reset({
        nameAr: '',
        nameHe: '',
        startDate: '',
        endDate: '',
        sortOrder: this.selectedYearPeriods().length + 1,
        isActive: true,
      });
    }
    this.showPeriodModal.set(true);
  }

  closePeriodModal() {
    this.showPeriodModal.set(false);
    this.editingPeriod.set(null);
    this.periodForm.reset();
  }

  async savePeriod() {
    this.periodForm.updateValueAndValidity();
    if (this.periodForm.invalid || !this.selectedYear()) {
      this.periodForm.markAllAsTouched();
      return;
    }
    this.isProcessing.set(true);
    const val = {
      ...this.periodForm.value,
      academicYearId: this.selectedYear()!.id,
    };

    try {
      if (this.editingPeriod()) {
        const res = await this.apiService.updateAcademicPeriod(this.editingPeriod()!.id, val);
        if (res.success) {
          this.closePeriodModal();
          this.showToast('تم تعديل بيانات الفترة الدراسية بنجاح.', 'success');
        } else {
          this.showToast(res.error || 'فشل في تعديل الفترة الدراسية.', 'error');
        }
      } else {
        const res = await this.apiService.createAcademicPeriod(val);
        if (res.success) {
          this.closePeriodModal();
          this.showToast('تم إضافة الفترة الدراسية بنجاح.', 'success');
        } else {
          this.showToast(res.error || 'فشل في إضافة الفترة الدراسية.', 'error');
        }
      }
    } catch (e) {
      this.showToast('حدث خطأ غير متوقع أثناء حفظ الفترة.', 'error');
    } finally {
      this.isProcessing.set(false);
    }
  }

  // Delete Confirm Logic
  confirmDelete(type: 'year' | 'period', id: string, name: string) {
    if (type === 'year') {
      const yearObj = this.apiService.academicYears().find(y => y.id === id);
      if (yearObj?.isCurrent) {
        this.showToast('لا يمكن حذف العام الدراسي الحالي والنشط في النظام.', 'error');
        return;
      }
    }
    this.confirmDeleteTarget.set({ type, id, name });
  }

  async executeDelete() {
    const target = this.confirmDeleteTarget();
    if (!target) return;
    this.isProcessing.set(true);
    this.confirmDeleteTarget.set(null);

    try {
      if (target.type === 'year') {
        const res = await this.apiService.deleteAcademicYear(target.id);
        if (res.success) {
          this.showToast('تم حذف العام الدراسي وكل ما يتعلق به بنجاح.', 'success');
          if (this.selectedYear()?.id === target.id) {
            this.selectedYear.set(null);
          }
        } else {
          this.showToast(res.error || 'فشل في حذف العام الدراسي. تأكد من خلوه من أي عمليات مرتبطة.', 'error');
        }
      } else if (target.type === 'period') {
        const res = await this.apiService.deleteAcademicPeriod(target.id);
        if (res.success) {
          this.showToast('تم حذف الفترة الدراسية بنجاح.', 'success');
        } else {
          this.showToast(res.error || 'فشل في حذف الفترة الدراسية.', 'error');
        }
      }
    } catch (e) {
      this.showToast('حدث خطأ غير متوقع أثناء الحذف.', 'error');
    } finally {
      this.isProcessing.set(false);
    }
  }
}
