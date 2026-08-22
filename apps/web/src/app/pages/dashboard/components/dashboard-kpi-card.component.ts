import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-dashboard-kpi-card',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <article class="dashboard-kpi">
      <div><p class="dashboard-kpi__label">{{ label }}</p><p class="dashboard-kpi__value">{{ value | number }}</p><p class="dashboard-kpi__empty">السنة الدراسية الحالية</p></div>
      <span class="dashboard-kpi__icon" [class]="toneClass"><mat-icon>{{ icon }}</mat-icon></span>
    </article>
  `,
  styles: [`
    .dashboard-kpi { display:flex; align-items:flex-start; justify-content:space-between; gap:var(--space-3); min-height:var(--control-height-lg); padding:var(--space-5); border:1px solid var(--outline-variant); border-radius:var(--radius-lg); background:var(--card-background); box-shadow:var(--shadow-sm); }
    .dashboard-kpi__label { margin:0; color:var(--on-surface-variant); font-size:var(--font-sm); font-weight:var(--font-semibold); }
    .dashboard-kpi__value { margin:var(--space-3) 0 0; color:var(--on-surface); font-size:var(--font-2xl); font-weight:var(--font-bold); }
    .dashboard-kpi__empty { margin:var(--space-2) 0 0; color:var(--on-surface-variant); font-size:var(--font-xs); }
    .dashboard-kpi__icon { display:grid; width:var(--space-12); height:var(--space-12); place-items:center; border-radius:var(--radius-md); }
    :host ::ng-deep .kpi-tone--primary { background:var(--primary-container); color:var(--on-primary-container); }
    :host ::ng-deep .kpi-tone--secondary { background:var(--secondary-container); color:var(--on-secondary-container); }
    :host ::ng-deep .kpi-tone--success { background:var(--success-container); color:var(--success); }
    :host ::ng-deep .kpi-tone--warning { background:var(--warning-container); color:var(--warning); }
  `],
})
export class DashboardKpiCardComponent {
  @Input() label = '';
  @Input() value = 0;
  @Input() icon = 'insights';
  @Input() toneClass = 'kpi-tone--primary';
}
