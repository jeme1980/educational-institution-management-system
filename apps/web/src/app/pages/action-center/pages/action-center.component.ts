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
import { ActionCenterResponse, ActionItem } from '../models/action-center.model';
import { actionTypeLabel, groupActionItems } from './action-center.helpers';

@Component({ selector: 'app-action-center', standalone: true, imports: [CommonModule, FormsModule, MatIconModule, UiPageHeaderComponent, UiFilterPanelComponent, UiSectionCardComponent, UiStatCardComponent, UiButtonComponent], templateUrl: './action-center.component.html', styleUrl: './action-center.component.css', changeDetection: ChangeDetectionStrategy.OnPush })
export class ActionCenterComponent implements OnInit {
  private readonly api = inject(ApiService); private readonly router = inject(Router);
  readonly years = signal<any[]>([]); readonly subjects = signal<any[]>([]); readonly groups = signal<any[]>([]); readonly response = signal<ActionCenterResponse | null>(null); readonly loading = signal(false); readonly error = signal('');
  academicYearId = ''; subjectId = ''; studyGroupId = '';
  readonly copy = { eyebrow: '\u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0629 \u0648\u0627\u0644\u062a\u062d\u0644\u064a\u0644', title: '\u0645\u0631\u0643\u0632 \u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0629 \u0627\u0644\u062a\u0631\u0628\u0648\u064a\u0629', description: '\u0623\u0648\u0644\u0648\u064a\u0627\u062a \u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0629 \u0627\u0644\u0645\u0633\u062a\u062e\u0644\u0635\u0629 \u0645\u0646 \u0645\u0633\u0627\u0631\u0627\u062a \u0627\u0644\u062a\u0642\u062f\u0645 \u0648\u062e\u0637\u0637 \u0627\u0644\u062a\u062f\u062e\u0644.', filterTitle: '\u0627\u062e\u062a\u064a\u0627\u0631 \u0633\u064a\u0627\u0642 \u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0629', initialTitle: '\u0627\u062e\u062a\u0631 \u0627\u0644\u0633\u0646\u0629 \u0627\u0644\u062f\u0631\u0627\u0633\u064a\u0629 \u0644\u0639\u0631\u0636 \u0623\u0648\u0644\u0648\u064a\u0627\u062a \u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0629.', initialHelper: '\u0633\u064a\u062a\u0645 \u062a\u062c\u0645\u064a\u0639 \u0627\u0644\u0625\u0634\u0627\u0631\u0627\u062a \u0648\u062e\u0637\u0637 \u0627\u0644\u062a\u062f\u062e\u0644 \u0636\u0645\u0646 \u0627\u0644\u0633\u0646\u0629 \u0627\u0644\u0645\u062e\u062a\u0627\u0631\u0629.' };
  readonly grouped = computed(() => groupActionItems(this.response()?.items || [])); readonly actionTypeLabel = actionTypeLabel;
  readonly kpis = computed(() => { const s = this.response()?.summary; return [{ label: '\u0625\u062c\u0645\u0627\u0644\u064a \u0639\u0646\u0627\u0635\u0631 \u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0629', value: s?.totalItems || 0, icon: 'fact_check', tone: 'primary' as const }, { label: '\u0637\u0644\u0627\u0628 \u064a\u062d\u062a\u0627\u062c\u0648\u0646 \u0645\u0631\u0627\u062c\u0639\u0629', value: s?.studentsNeedingReview || 0, icon: 'person_search', tone: 'warning' as const }, { label: '\u0634\u0639\u0628 \u062a\u062d\u062a\u0627\u062c \u0645\u0631\u0627\u062c\u0639\u0629', value: s?.classesNeedingReview || 0, icon: 'meeting_room', tone: 'neutral' as const }, { label: '\u0645\u0647\u0627\u0631\u0627\u062a \u0648\u0645\u0648\u0636\u0648\u0639\u0627\u062a', value: s?.dimensionsNeedingReview || 0, icon: 'schema', tone: 'primary' as const }, { label: '\u062a\u062f\u062e\u0644\u0627\u062a \u062a\u062d\u062a\u0627\u062c \u0645\u062a\u0627\u0628\u0639\u0629', value: s?.interventionsNeedingReview || 0, icon: 'assignment_turned_in', tone: 'danger' as const }]; });
  async ngOnInit() { await Promise.all([this.api.loadAcademicYears(), this.api.loadSubjects()]); const years = this.api.academicYears() as any[]; this.years.set(years); this.subjects.set(this.api.subjects() as any[]); const current = years.find((item: any) => item.isCurrent); if (current) { this.academicYearId = current.id; await this.load(); } }
  async loadGroups() { this.studyGroupId = ''; const result = this.academicYearId && this.subjectId ? await this.api.loadProgressTrackingStudyGroups({ academicYearId: this.academicYearId, subjectId: this.subjectId }) : []; this.groups.set((result || []) as any[]); }
  async load() { if (!this.academicYearId) return; this.loading.set(true); this.error.set(''); const result = await this.api.loadActionCenter({ academicYearId: this.academicYearId, subjectId: this.subjectId || undefined, studyGroupId: this.studyGroupId || undefined }); if (result) this.response.set(result); else this.error.set('\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u0645\u0631\u0643\u0632 \u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0629 \u0627\u0644\u062a\u0631\u0628\u0648\u064a\u0629.'); this.loading.set(false); }
  async yearChanged() { this.subjectId = ''; this.studyGroupId = ''; this.response.set(null); this.error.set(''); this.groups.set([]); if (this.academicYearId) await this.load(); }
  async subjectChanged() { await this.loadGroups(); await this.load(); }
  open(item: ActionItem) { this.router.navigate([item.action.route], { queryParams: item.action.queryParams || {} }); }
  itemsFor(section: string): ActionItem[] { return this.grouped()[section as keyof ReturnType<typeof groupActionItems>] || []; }
  track(_: number, item: ActionItem) { return item.key; }
}
