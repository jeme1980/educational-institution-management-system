import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ApiService } from '../../../core/services/api.service';
import type { DashboardStats } from '../../../core/models/api.models';
import { DashboardKpiCardComponent } from '../components/dashboard-kpi-card.component';
import { DashboardBarChartComponent } from '../components/dashboard-bar-chart.component';
import { DashboardRecentEnrollmentsComponent } from '../components/dashboard-recent-enrollments.component';

export interface DashboardQuickAction {
  label: string;
  description: string;
  icon: string;
  route: string;
  permission: string;
}

export const DASHBOARD_QUICK_ACTIONS: readonly DashboardQuickAction[] = [
  { label: 'الطلاب', description: 'مراجعة سجلات الطلاب', icon: 'groups', route: '/students', permission: 'students:read' },
  { label: 'بيانات الالتحاق', description: 'مراجعة تسجيلات الطلاب', icon: 'assignment_ind', route: '/enrollments', permission: 'students:update' },
  { label: 'الصفوف والشعب', description: 'إدارة الصفوف والشعب', icon: 'meeting_room', route: '/classes', permission: 'settings:read' },
  { label: 'الكادر والتعيينات', description: 'إدارة المعلمين والموظفين', icon: 'supervisor_account', route: '/staff', permission: 'teachers:read' },
  { label: 'الامتحانات', description: 'متابعة الامتحانات والنتائج', icon: 'assignment', route: '/exams', permission: 'exams:read' },
];

export function filterDashboardQuickActions(actions: readonly DashboardQuickAction[], permissions: readonly string[]): DashboardQuickAction[] {
  return actions.filter((action) => permissions.includes(action.permission));
}

export type DashboardViewState = 'loading' | 'error' | 'content';

export function resolveDashboardViewState(stats: DashboardStats | null, hasLoaded: boolean, error: string): DashboardViewState {
  if (!stats && !hasLoaded) return 'loading';
  if (!stats && error) return 'error';
  return 'content';
}

export function dashboardKpiValues(stats: DashboardStats | null): number[] | null {
  return stats ? [stats.kpis.activeStudents, stats.kpis.staffMembers, stats.kpis.classes, stats.kpis.guardians] : null;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-dashboard',
  imports: [CommonModule, MatIconModule, RouterLink, DashboardKpiCardComponent, DashboardBarChartComponent, DashboardRecentEnrollmentsComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  apiService = inject(ApiService);
  private readonly authService = inject(AuthService);
  analyticsTab = signal<'gender' | 'feature' | 'status' | 'town'>('gender');
  readonly isLoading = signal(false);
  readonly hasLoaded = signal(false);
  readonly loadError = signal('');
  readonly viewState = computed(() => resolveDashboardViewState(this.apiService.stats(), this.hasLoaded(), this.loadError()));
  readonly quickActions = computed(() => filterDashboardQuickActions(DASHBOARD_QUICK_ACTIONS, this.authService.currentContext()?.permissions || []));

  ngOnInit(): void {
    void this.refreshDashboard();
  }

  async refreshDashboard(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set('');
    const statsLoaded = await this.apiService.loadDashboardStats();
    await Promise.all([
      this.apiService.loadAcademicYears(),
      this.apiService.loadLookups(),
    ]);
    this.hasLoaded.set(true);
    if (!statsLoaded) this.loadError.set(this.apiService.dashboardError() || 'تعذر تحميل بيانات لوحة القيادة. حاول مرة أخرى.');
    this.isLoading.set(false);
  }

  setAnalyticsTab(tab: 'gender' | 'feature' | 'status' | 'town'): void { this.analyticsTab.set(tab); }
}
