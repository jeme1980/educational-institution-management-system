import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

@Component({ changeDetection: ChangeDetectionStrategy.OnPush, standalone: true, imports: [CommonModule, MatIconModule, RouterLink], templateUrl: './platform.component.html', styleUrl: './platform.component.css' })
export class PlatformComponent {
  private readonly api = inject(ApiService);
  readonly loading = signal(true); readonly error = signal('');
  readonly institutions = signal<any[]>([]); readonly plans = signal<any[]>([]); readonly audit = signal<any[]>([]);
  constructor() { void this.load(); }
  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [institutions, plans, audit] = await Promise.all([this.api.apiFetch('/api/platform/institutions'), this.api.apiFetch('/api/platform/plans'), this.api.apiFetch('/api/platform/audit-logs')]);
      if (!institutions.ok || !plans.ok || !audit.ok) throw new Error('تعذر تحميل بيانات المنصة.');
      this.institutions.set(await institutions.json()); this.plans.set(await plans.json()); this.audit.set(await audit.json());
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'تعذر تحميل بيانات المنصة.'); }
    finally { this.loading.set(false); }
  }
  get activeInstitutions(): number { return this.institutions().filter((item) => item.status?.isActive !== false).length; }
  get activePlans(): number { return this.plans().filter((item) => item.isActive !== false).length; }
  get trialInstitutions(): number { return this.institutions().filter((item) => item.subscription?.status === 'TRIAL').length; }
  get setupPending(): number { return this.institutions().filter((item) => item.initialAdmin?.status === 'PENDING_SETUP').length; }
}
