import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../core/services/api.service';
import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import { UiFilterPanelComponent } from '../../../shared/components/ui-filter-panel/ui-filter-panel.component';
import { UiSectionCardComponent } from '../../../shared/components/ui-section-card/ui-section-card.component';
import { UiStatCardComponent } from '../../../shared/components/ui-stat-card/ui-stat-card.component';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { ActionCenterResponse, ActionItem, ActionType } from '../models/action-center.model';
import { actionTypeLabel, groupActionItems } from './action-center.helpers';

@Component({ selector: 'app-action-center', standalone: true, imports: [CommonModule, FormsModule, MatIconModule, UiPageHeaderComponent, UiFilterPanelComponent, UiSectionCardComponent, UiStatCardComponent, UiButtonComponent], templateUrl: './action-center.component.html', styleUrl: './action-center.component.css', changeDetection: ChangeDetectionStrategy.OnPush })
export class ActionCenterComponent implements OnInit {
  private readonly api = inject(ApiService); private readonly router = inject(Router);
  readonly years = signal<any[]>([]); readonly subjects = signal<any[]>([]); readonly groups = signal<any[]>([]); readonly response = signal<ActionCenterResponse | null>(null); readonly loading = signal(false); readonly error = signal('');
  academicYearId = ''; subjectId = ''; studyGroupId = '';
  readonly grouped = computed(() => groupActionItems(this.response()?.items || []));
  readonly actionTypeLabel = actionTypeLabel;
  readonly kpis = computed(() => { const summary = this.response()?.summary; return [{ label: 'إجمالي عناصر المتابعة', value: summary?.totalItems || 0, icon: 'fact_check', tone: 'primary' as const }, { label: 'طلاب يحتاجون مراجعة', value: summary?.studentsNeedingReview || 0, icon: 'person_search', tone: 'warning' as const }, { label: 'شعب تحتاج مراجعة', value: summary?.classesNeedingReview || 0, icon: 'meeting_room', tone: 'neutral' as const }, { label: 'مهارات وموضوعات', value: summary?.dimensionsNeedingReview || 0, icon: 'schema', tone: 'primary' as const }, { label: 'تدخلات تحتاج متابعة', value: summary?.interventionsNeedingReview || 0, icon: 'assignment_turned_in', tone: 'danger' as const }]; });
  async ngOnInit() { await Promise.all([this.api.loadAcademicYears(), this.api.loadSubjects()]); const years = this.api.academicYears() as any[]; const subjects = this.api.subjects() as any[]; this.years.set(years); this.subjects.set(subjects); const year = years.find((item: any) => item.isCurrent) || years[0]; if (year) { this.academicYearId = year.id; this.subjectId = subjects.find((item: any) => !item.academicYearId || item.academicYearId === year.id)?.id || ''; await this.loadGroups(); await this.load(); } }
  async loadGroups() { this.studyGroupId = ''; const result = this.academicYearId && this.subjectId ? await this.api.loadProgressTrackingStudyGroups({ academicYearId: this.academicYearId, subjectId: this.subjectId }) : []; this.groups.set((result || []) as any[]); }
  async load() { if (!this.academicYearId) return; this.loading.set(true); this.error.set(''); const response = await this.api.loadActionCenter({ academicYearId: this.academicYearId, subjectId: this.subjectId || undefined, studyGroupId: this.studyGroupId || undefined }); if (response) this.response.set(response); else this.error.set('تعذر تحميل مركز المتابعة التربوية.'); this.loading.set(false); }
  async yearChanged() { this.subjectId = this.subjects().find((item: any) => item.academicYearId === this.academicYearId)?.id || ''; await this.loadGroups(); await this.load(); }
  async subjectChanged() { await this.loadGroups(); await this.load(); }
  open(item: ActionItem) { this.router.navigate([item.action.route], { queryParams: item.action.queryParams || {} }); }
  itemsFor(section: string): ActionItem[] { return this.grouped()[section as keyof ReturnType<typeof groupActionItems>] || []; }
  track(_: number, item: ActionItem) { return item.key; }
}
