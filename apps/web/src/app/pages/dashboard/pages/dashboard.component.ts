import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../core/services/api.service';
import { DashboardKpiCardComponent } from '../components/dashboard-kpi-card.component';
import { DashboardBarChartComponent } from '../components/dashboard-bar-chart.component';
import { DashboardRecentEnrollmentsComponent } from '../components/dashboard-recent-enrollments.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-dashboard',
  imports: [CommonModule, MatIconModule, DashboardKpiCardComponent, DashboardBarChartComponent, DashboardRecentEnrollmentsComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  apiService = inject(ApiService);
  analyticsTab = signal<'gender' | 'feature' | 'status' | 'town'>('gender');

  ngOnInit(): void {
    void this.refreshDashboard();
  }

  async refreshDashboard(): Promise<void> {
    await Promise.all([
      this.apiService.loadDashboardStats(),
      this.apiService.loadAcademicYears(),
      this.apiService.loadLookups(),
    ]);
  }

  setAnalyticsTab(tab: 'gender' | 'feature' | 'status' | 'town'): void { this.analyticsTab.set(tab); }
}
