import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { UiButtonComponent } from '../../shared/components/ui-button/ui-button.component';

@Component({ standalone: true, imports: [CommonModule, FormsModule, UiButtonComponent], templateUrl: './account-setup.component.html' })
export class AccountSetupComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  readonly token = this.route.snapshot.queryParamMap.get('token') || '';
  readonly password = signal('');
  readonly confirmPassword = signal('');
  readonly error = signal('');
  readonly success = signal('');
  readonly loading = signal(false);

  async submit(): Promise<void> {
    this.error.set(''); this.success.set('');
    if (!this.token) { this.error.set('رابط الإعداد غير صالح.'); return; }
    if (this.password() !== this.confirmPassword()) { this.error.set('كلمتا المرور غير متطابقتين.'); return; }
    this.loading.set(true);
    try {
      const response = await this.api.apiFetch('/api/account/setup', { method: 'POST', body: JSON.stringify({ token: this.token, password: this.password(), confirmPassword: this.confirmPassword() }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { this.error.set(body.error || 'تعذر إعداد الحساب.'); return; }
      this.success.set('تم إعداد الحساب بنجاح. سيتم تحويلك إلى تسجيل الدخول.');
      setTimeout(() => void this.router.navigateByUrl('/login'), 900);
    } catch { this.error.set('تعذر الاتصال بالخادم.'); }
    finally { this.loading.set(false); }
  }
}
