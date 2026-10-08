import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { UiBadgeComponent, UiBadgeTone } from '../../shared/components/ui-badge/ui-badge.component';
import { UiButtonComponent } from '../../shared/components/ui-button/ui-button.component';
import { UiModalComponent } from '../../shared/components/ui-modal/ui-modal.component';
import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';

@Component({
  selector: 'app-platform-admin-setup',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, UiBadgeComponent, UiButtonComponent, UiModalComponent],
  template: `
    <ui-modal [open]="true" [title]="'إعداد مدير المؤسسة — ' + institutionName()" size="md" (closed)="closed.emit()">
      @if (loading()) { <div ui-modal-body class="text-sm text-on-surface-variant">جارٍ تحميل حالة إعداد المدير...</div> }
      @else if (error()) { <div ui-modal-body role="alert" class="rounded-md border border-danger-container bg-danger-container p-3 text-sm text-on-danger-container">{{ error() }}</div> }
      @else if (admin(); as current) {
        <div ui-modal-body class="grid gap-4">
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-surface-border bg-surface-container-low p-3">
            <div><strong class="block text-on-surface">{{ current.admin?.displayName || current.admin?.email }}</strong><span class="text-sm text-on-surface-variant">{{ current.admin?.email }}</span></div>
            <ui-badge [tone]="statusTone(current.status)">{{ statusLabel(current.status) }}</ui-badge>
          </div>
          @if (current.status === 'PENDING_SETUP' || current.status === 'SETUP_EXPIRED') {
            <div class="rounded-md border border-surface-border p-3 text-sm text-on-surface-variant">
              @if (setupUrl()) { <p class="break-all font-mono text-xs text-on-surface">{{ setupUrl() }}</p><ui-button type="button" variant="secondary" (activated)="copySetupLink()">نسخ الرابط</ui-button> }
              @else { <p>الرابط الأصلي لا يُعاد عرضه بعد الإصدار. استخدم إعادة الإصدار لإنشاء رابط جديد آمن.</p> }
              <p class="mt-2">ينتهي الرابط في {{ current.setup?.expiresAt ? (current.setup.expiresAt | date:'medium') : 'غير متاح' }}.</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <ui-button type="button" [loading]="saving()" [disabled]="saving()" (activated)="reissue()">إعادة إصدار الرابط</ui-button>
              @if (current.status === 'PENDING_SETUP') { <ui-button type="button" variant="danger" [loading]="saving()" [disabled]="saving()" (activated)="revoke()">إلغاء الرابط</ui-button> }
            </div>
          } @else if (current.status === 'ACTIVE') {
            <p class="text-sm text-on-surface-variant">تم تفعيل حساب المدير في {{ current.admin?.activatedAt ? (current.admin.activatedAt | date:'medium') : 'وقت سابق' }}.</p>
          } @else {
            <p class="text-sm text-on-surface-variant">لا يمكن إصدار رابط جديد لهذا الحساب بالحالة الحالية.</p>
          }
        </div>
      } @else {
        <div ui-modal-body class="grid gap-4">
          <p class="text-sm text-on-surface-variant">لم يتم إعداد مدير أول للمؤسسة. سيحصل المدير على رابط آمن لاستخدامه مرة واحدة واختيار كلمة المرور.</p>
          <label>البريد الإلكتروني *<input class="ui-form-control" type="email" required aria-label="البريد الإلكتروني" (input)="email.set($any($event.target).value)" /></label>
          <label>الاسم الأول *<input class="ui-form-control" required aria-label="الاسم الأول" (input)="firstNameAr.set($any($event.target).value)" /></label>
          <label>اسم العائلة *<input class="ui-form-control" required aria-label="اسم العائلة" (input)="familyNameAr.set($any($event.target).value)" /></label>
          <label>الهاتف<input class="ui-form-control" type="tel" aria-label="الهاتف" (input)="phoneNumber.set($any($event.target).value)" /></label>
          @if (formError()) { <p role="alert" class="text-sm text-danger">{{ formError() }}</p> }
        </div>
      }
      @if (!loading() && !error() && !admin()) {
        <div ui-modal-footer><ui-button type="button" [loading]="saving()" [disabled]="saving()" (activated)="issue()">إصدار رابط إعداد المدير</ui-button></div>
      }
    </ui-modal>
  `,
})
export class PlatformAdminSetupComponent {
  readonly institutionId = input.required<string>();
  readonly institutionName = input('المؤسسة');
  readonly closed = output<void>();
  readonly changed = output<void>();
  private readonly api = inject(ApiService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly formError = signal('');
  readonly admin = signal<any | null>(null);
  readonly setupUrl = signal('');
  readonly email = signal('');
  readonly firstNameAr = signal('');
  readonly familyNameAr = signal('');
  readonly phoneNumber = signal('');

  constructor() { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try {
      const response = await this.api.apiFetch(`/api/platform/institutions/${this.institutionId()}/initial-admin`);
      if (!response.ok) { this.error.set('تعذر تحميل حالة إعداد المدير.'); return; }
      const item = await response.json();
      this.admin.set(item.status === 'NOT_PROVISIONED' ? null : item);
    } catch {
      this.error.set('تعذر تحميل حالة إعداد المدير. حاول مرة أخرى.');
    } finally {
      this.loading.set(false);
    }
  }

  async issue(): Promise<void> {
    this.formError.set('');
    if (!this.email().trim() || !this.firstNameAr().trim() || !this.familyNameAr().trim()) { this.formError.set('أدخل البريد والاسم الأول واسم العائلة.'); return; }
    await this.mutate(`/api/platform/institutions/${this.institutionId()}/initial-admin`, { email: this.email(), firstNameAr: this.firstNameAr(), familyNameAr: this.familyNameAr(), phoneNumber: this.phoneNumber() });
  }

  async reissue(): Promise<void> {
    await this.mutate(`/api/platform/institutions/${this.institutionId()}/initial-admin/reissue`, {});
  }

  async revoke(): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({ title: 'إلغاء رابط إعداد المدير', message: 'سيصبح الرابط الحالي غير صالح ولن يمكن استخدامه. هل تريد المتابعة؟', confirmText: 'إلغاء الرابط', variant: 'danger' });
    if (confirmed) await this.mutate(`/api/platform/institutions/${this.institutionId()}/initial-admin/revoke`, {});
  }

  async copySetupLink(): Promise<void> {
    if (!this.setupUrl()) return;
    try { await navigator.clipboard.writeText(this.setupUrl()); } catch { this.formError.set('تعذر نسخ الرابط. انسخه يدويًا.'); }
  }

  statusLabel(status: string): string { return ({ NOT_PROVISIONED: 'لم يتم الإعداد', PENDING_SETUP: 'بانتظار الإكمال', SETUP_EXPIRED: 'الرابط منتهٍ', ACTIVE: 'مكتمل', DISABLED: 'معطّل' } as Record<string, string>)[status] || status; }
  statusTone(status: string): UiBadgeTone { return ({ NOT_PROVISIONED: 'disabled', PENDING_SETUP: 'warning', SETUP_EXPIRED: 'danger', ACTIVE: 'success', DISABLED: 'neutral' } as Record<string, UiBadgeTone>)[status] || 'neutral'; }

  private async mutate(url: string, body: Record<string, unknown>): Promise<void> {
    this.saving.set(true);
    try {
      const response = await this.api.apiFetch(url, { method: 'POST', body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { this.formError.set(payload.error || 'تعذر تنفيذ العملية.'); return; }
      this.setupUrl.set(payload.setup?.setupUrl || '');
      await this.load();
      this.changed.emit();
    } catch {
      this.formError.set('تعذر تنفيذ العملية. تحقق من الاتصال وحاول مرة أخرى.');
    } finally {
      this.saving.set(false);
    }
  }
}
