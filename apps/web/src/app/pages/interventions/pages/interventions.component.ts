import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../core/services/api.service';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { UiFilterPanelComponent } from '../../../shared/components/ui-filter-panel/ui-filter-panel.component';
import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import { UiSectionCardComponent } from '../../../shared/components/ui-section-card/ui-section-card.component';
import { UiSelectComponent } from '../../../shared/components/select/ui-select.component';
import { UiTableActionsComponent } from '../../../shared/components/ui-table-actions/ui-table-actions.component';
import { InterventionDetail, InterventionListItem, InterventionStatus } from '../models/intervention.model';

@Component({
  selector: 'app-interventions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatIconModule, UiButtonComponent, UiFilterPanelComponent, UiPageHeaderComponent, UiSectionCardComponent, UiSelectComponent, UiTableActionsComponent],
  templateUrl: './interventions.component.html',
  styleUrl: './interventions.component.css',
})
export class InterventionsComponent {
  readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly router = inject(Router);
  readonly items = signal<InterventionListItem[]>([]);
  readonly detail = signal<InterventionDetail | null>(null);
  readonly outcomes = signal<any | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly isCreate = signal(false);
  readonly selectedYearId = signal('');
  readonly selectedSubjectId = signal('');
  readonly selectedGroupId = signal('');
  readonly selectedStatus = signal('');
  readonly title = signal('');
  readonly activity = signal('');
  readonly duration = signal('');
  readonly startDate = signal(new Date().toISOString().slice(0, 10));
  readonly targetMastery = signal<number | null>(null);
  readonly groupMembers = signal<any[]>([]);
  readonly selectedStudentIds = signal<string[]>([]);
  readonly selectedSkillIds = signal<string[]>([]);
  readonly contextSubjectId = signal('');
  readonly contextGroupId = signal('');
  readonly contextExamId = signal('');
  readonly contextSkillIds = signal<string[]>([]);
  readonly contextSubjectLabel = computed(() => this.api.subjects().find((item: any) => item.id === this.contextSubjectId())?.nameAr || 'غير محددة');
  readonly criterionLabel = (item: InterventionDetail): string => item.successCriterion?.displayText || (item.successCriterion?.targetMasteryPercentage != null ? `الوصول إلى ${item.successCriterion.targetMasteryPercentage}%` : 'لم يحدد معيار رقمي.');
  readonly subjects = computed(() => this.api.subjects().filter((item: any) => item.academicYearId === this.selectedYearId() && item.isActive !== false && !item.archivedAt));
  readonly skills = computed(() => this.api.skills().filter((item: any) => item.academicYearId === this.selectedYearId() && item.subjectId === this.contextSubjectId() && item.isActive !== false && !item.archivedAt));
  readonly statusLabel = (status: InterventionStatus): string => ({ planned: 'مخططة', active: 'نشطة', completed: 'مكتملة', cancelled: 'ملغاة' })[status];
  readonly outcomeLabel = (value: string): string => ({ improved: 'تحسن ملحوظ', declined: 'انخفاض', noComparison: 'لا توجد مقارنة' }[value] || 'غير متاح');

  constructor() {
    this.selectedYearId.set(this.api.selectedAcademicYearId() || this.api.academicYears().find((item: any) => item.isCurrent)?.id || this.api.academicYears()[0]?.id || '');
    const id = this.route.snapshot.paramMap.get('id');
    this.isCreate.set(id === 'new');
    if (id === 'new') this.prepareCreate();
    else if (id) void this.loadDetail(id);
    else void this.loadList();
  }

  async loadList(): Promise<void> {
    this.loading.set(true); this.error.set('');
    const result = await this.api.loadInterventions({ academicYearId: this.selectedYearId(), subjectId: this.selectedSubjectId(), studyGroupId: this.selectedGroupId(), status: this.selectedStatus() });
    this.items.set(Array.isArray(result) ? result : []); this.loading.set(false);
  }

  async loadDetail(id: string): Promise<void> {
    this.loading.set(true); this.error.set('');
    const [detail, outcomes] = await Promise.all([this.api.loadIntervention(id), this.api.loadInterventionOutcomes(id)]);
    if (!detail) this.error.set('تعذر تحميل خطة التدخل.');
    this.detail.set(detail); this.outcomes.set(outcomes); this.loading.set(false);
  }

  prepareCreate(): void {
    const query = this.route.snapshot.queryParamMap;
    this.contextSubjectId.set(query.get('subjectId') || ''); this.contextGroupId.set(query.get('studyGroupId') || ''); this.contextExamId.set(query.get('baselineExamId') || '');
    this.contextSkillIds.set((query.get('skillIds') || '').split(',').filter(Boolean));
    this.selectedSkillIds.set(this.contextSkillIds()); this.selectedSubjectId.set(this.contextSubjectId()); this.selectedGroupId.set(this.contextGroupId());
    this.title.set(query.get('title') || 'خطة تدخل ومتابعة'); this.activity.set(query.get('activity') || ''); this.duration.set(query.get('duration') || '');
    if (this.contextGroupId()) void this.loadMembers(this.contextGroupId(), (query.get('studentIds') || '').split(',').filter(Boolean));
  }

  async loadMembers(groupId: string, studentIds: string[] = []): Promise<void> {
    const members = await this.api.loadGroupMembers(groupId); this.groupMembers.set(members);
    const selected = members.filter(item => !studentIds.length || studentIds.includes(item.studentId || item.enrollment?.studentId)).map(item => item.enrollmentId || item.enrollment?.id || item.id).filter(Boolean);
    this.selectedStudentIds.set(selected);
  }

  async save(): Promise<void> {
    if (!this.title().trim() || !this.contextSubjectId() || !this.contextGroupId() || !this.contextExamId() || !this.selectedStudentIds().length || !this.selectedSkillIds().length) { this.error.set('أكمل سياق الخطة والطلاب والمهارات المستهدفة أولًا.'); return; }
    this.saving.set(true); this.error.set('');
    const created = await this.api.createIntervention({ academicYearId: this.selectedYearId(), subjectId: this.contextSubjectId(), studyGroupId: this.contextGroupId(), baselineExamId: this.contextExamId(), title: this.title().trim(), activity: this.activity().trim() || null, plannedDuration: this.duration().trim() || null, startDate: this.startDate(), successCriterion: this.targetMastery() == null ? null : { targetMasteryPercentage: this.targetMastery() }, studentEnrollmentIds: this.selectedStudentIds(), skillIds: this.selectedSkillIds() });
    this.saving.set(false);
    if (!created?.id) { this.error.set('تعذر حفظ خطة التدخل.'); return; }
    await this.router.navigate(['/interventions', created.id]);
  }

  toggleSkill(id: string): void { this.selectedSkillIds.update(values => values.includes(id) ? values.filter(value => value !== id) : [...values, id]); }
  toggleStudent(id: string): void { this.selectedStudentIds.update(values => values.includes(id) ? values.filter(value => value !== id) : [...values, id]); }
  open(item: InterventionListItem): void { void this.router.navigate(['/interventions', item.id]); }
  openCreate(): void { void this.router.navigate(['/interventions/new']); }
  goList(): void { void this.router.navigate(['/interventions']); }
  async updateStatus(status: InterventionStatus): Promise<void> { const item = this.detail(); if (!item) return; const result = await this.api.updateIntervention(item.id, { status }); if (result) this.detail.set({ ...item, status }); }
}
