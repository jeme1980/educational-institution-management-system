import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SettingsApiService } from '../../../core/services/settings-api.service';

@Component({
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './subscription.component.html',
})
export class SubscriptionComponent {
  private readonly settingsApi = inject(SettingsApiService);
  readonly subscription = signal<any>(null);
  readonly loading = signal(true);
  readonly error = signal('');

  constructor() { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    const result = await this.settingsApi.loadSubscription();
    if (result?.error) this.error.set(result.error);
    else this.subscription.set(result);
    this.loading.set(false);
  }

  statusLabel(status: string): string {
    return ({ TRIAL: 'تجريبية', ACTIVE: 'فعالة', PAST_DUE: 'متأخرة السداد', SUSPENDED: 'موقوفة', CANCELLED: 'ملغاة', EXPIRED: 'منتهية' } as Record<string, string>)[status] || status;
  }
}
