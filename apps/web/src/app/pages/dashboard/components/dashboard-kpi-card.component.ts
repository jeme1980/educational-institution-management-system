import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-dashboard-kpi-card',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <article class="dashboard-kpi">
      <div><p class="dashboard-kpi__label">{{ label }}</p><p class="dashboard-kpi__value">{{ value | number }}</p><p class="dashboard-kpi__empty">{{ value === 0 ? 'لا توجد بيانات بعد' : 'السنة الدراسية الحالية' }}</p></div>
      <span class="dashboard-kpi__icon" [class]="toneClass"><mat-icon>{{ icon }}</mat-icon></span>
    </article>
  `,
  styles: [`
    .dashboard-kpi { display:flex; align-items:flex-start; justify-content:space-between; gap:var(--space-3); padding:var(--space-5); border:1px solid var(--color-neutral-100); border-radius:var(--radius-lg); background:var(--color-neutral-50); box-shadow:var(--shadow-sm); }
    .dashboard-kpi__label { margin:0; color:var(--color-neutral-500); font-size:var(--font-sm); font-weight:var(--font-semibold); }
    .dashboard-kpi__value { margin:var(--space-3) 0 0; color:var(--color-neutral-900); font-size:var(--font-2xl); font-weight:var(--font-bold); }
    .dashboard-kpi__empty { margin:var(--space-2) 0 0; color:var(--color-neutral-500); font-size:var(--font-xs); }
    .dashboard-kpi__icon { display:grid; width:var(--space-12); height:var(--space-12); place-items:center; border-radius:var(--radius-md); }
    :host ::ng-deep .kpi-tone--primary { background:var(--color-primary-100); color:var(--color-primary-700); }
    :host ::ng-deep .kpi-tone--secondary { background:var(--color-secondary-100); color:var(--color-secondary-700); }
    :host ::ng-deep .kpi-tone--success { background:var(--color-success-100); color:var(--color-success-700); }
    :host ::ng-deep .kpi-tone--warning { background:var(--color-warning-100); color:var(--color-warning-700); }
  `],
})
export class DashboardKpiCardComponent {
  @Input() label = '';
  @Input() value = 0;
  @Input() icon = 'insights';
  @Input() toneClass = 'kpi-tone--primary';
}
