import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { SettingsApiService } from '../../../core/services/settings-api.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './audit-log.component.html',
})
export class AuditLogComponent {
  private readonly settingsApi = inject(SettingsApiService);
  readonly rows = signal<any[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly loading = signal(false);
  readonly error = signal('');
  action = ''; entityType = ''; from = ''; to = '';

  constructor() { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    const result = await this.settingsApi.loadAuditLogs({ page: this.page(), pageSize: this.pageSize(), action: this.action, entityType: this.entityType, from: this.from, to: this.to });
    this.rows.set(result.items || []); this.total.set(result.total || 0); if (result.error) this.error.set(result.error);
    this.loading.set(false);
  }

  async reset(): Promise<void> { this.action = ''; this.entityType = ''; this.from = ''; this.to = ''; this.page.set(1); await this.load(); }
  async next(): Promise<void> { if (this.page() * this.pageSize() < this.total()) { this.page.update(value => value + 1); await this.load(); } }
  async previous(): Promise<void> { if (this.page() > 1) { this.page.update(value => value - 1); await this.load(); } }
}
