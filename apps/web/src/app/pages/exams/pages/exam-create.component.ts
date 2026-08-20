import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../core/services/api.service';
import { ExamsStateService } from '../services/exams-state.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';

@Component({
  selector: 'app-exam-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, MatIconModule],
  templateUrl: './exam-create.component.html',
  styleUrl: './exam-create.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExamCreateComponent implements OnInit {
  readonly api = inject(ApiService);
  readonly confirmDialog = inject(ConfirmDialogService);
  private readonly state = inject(ExamsStateService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly toast = signal('');
  readonly groups = signal<any[]>([]);
  readonly selectedGroupIds = signal<string[]>([]);
  readonly subjectId = signal('');
  readonly hasChanges = signal(false);

  readonly form = this.fb.nonNullable.group({
    titleAr: ['', [Validators.required, Validators.maxLength(250)]],
    titleHe: [''],
    academicPeriodId: ['', Validators.required],
    subjectId: ['', Validators.required],
    examTypeId: ['', Validators.required],
    examDate: [new Date().toISOString().slice(0, 10), Validators.required],
    maxScore: [100, [Validators.required, Validators.min(0.01)]],
    weight: [null as number | null],
    notes: [''],
  });

  readonly currentYear = computed(() => this.api.academicYears().find((item: any) => item.id === this.api.selectedAcademicYearId()) || null);
  readonly availableGroups = computed(() => this.groups().filter((group: any) =>
    group.subjectId === this.subjectId() &&
    group.academicYearId === this.api.selectedAcademicYearId(),
  ));

  async ngOnInit(): Promise<void> {
    this.form.valueChanges.subscribe(() => this.hasChanges.set(true));
    this.form.controls.subjectId.valueChanges.subscribe(value => { this.subjectId.set(value); this.selectedGroupIds.set([]); });
    try {
      await Promise.all([
        this.api.loadAcademicYears(),
        this.api.loadAcademicPeriods(),
        this.api.loadSubjects(),
        this.api.loadExamTypes(),
        this.state.loadStudyGroups(),
      ]);
      this.groups.set(this.state.studyGroups());
      this.form.reset({
        titleAr: '', titleHe: '',
        academicPeriodId: this.api.academicPeriods()[0]?.id || '',
        subjectId: this.api.subjects()[0]?.id || '',
        examTypeId: this.api.examTypes()[0]?.id || '',
        examDate: new Date().toISOString().slice(0, 10),
        maxScore: 100, weight: null, notes: '',
      });
      this.subjectId.set(this.form.controls.subjectId.value);
      this.form.markAsPristine();
      this.hasChanges.set(false);
    } catch (cause) {
      console.error('Failed to load exam creation lookups', cause);
      this.error.set('تعذر تحميل قوائم إنشاء الامتحان. أعد تحميل الصفحة وحاول مرة أخرى.');
    } finally {
      this.loading.set(false);
    }
  }

  toggleGroup(id: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedGroupIds.update(ids => checked ? [...new Set([...ids, id])] : ids.filter(item => item !== id));
    this.hasChanges.set(true);
  }

  removeGroup(id: string): void {
    this.selectedGroupIds.update(ids => ids.filter(item => item !== id));
    this.hasChanges.set(true);
  }

  groupName(id: string): string {
    return this.groups().find(item => item.id === id)?.nameAr || 'مجموعة غير معروفة';
  }

  async cancel(): Promise<void> {
    if (this.hasChanges() && !await this.confirmDialog.confirm({ title: 'مغادرة الصفحة', message: 'لديك بيانات غير محفوظة. هل تريد مغادرة الصفحة؟', variant: 'default' })) return;
    void this.router.navigate(['/exams']);
  }

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    if (!this.selectedGroupIds().length) {
      this.error.set('يجب اختيار مجموعة تعلم واحدة على الأقل.');
      return;
    }

    this.saving.set(true);
    this.error.set('');
    try {
      const created = await this.api.createExam(this.form.getRawValue());
      if (!created?.id) throw new Error('CREATE_EXAM_FAILED');
      const groupsSaved = await this.state.saveExamStudyGroups(created.id, this.selectedGroupIds());
      if (!groupsSaved) throw new Error('SAVE_GROUPS_FAILED');
      this.toast.set('تم إنشاء الامتحان بنجاح.');
      this.hasChanges.set(false);
      await new Promise(resolve => setTimeout(resolve, 350));
      await this.router.navigate(['/exams', created.id, 'builder'], { queryParams: { created: '1' } });
    } catch (cause) {
      console.error('Failed to create exam', cause);
      this.error.set('تعذر إنشاء الامتحان. حاول مرة أخرى.');
    } finally {
      this.saving.set(false);
    }
  }
}
