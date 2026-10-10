import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ApiService } from '../../core/services/api.service';
import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';
import { PlatformAdminSetupComponent } from './platform-admin-setup.component';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('PlatformAdminSetupComponent', () => {
  let fixture: ComponentFixture<PlatformAdminSetupComponent>;
  let calls: string[];
  let shouldFail = false;
  let status: Record<string, unknown>;
  let issued = 0;

  beforeEach(async () => {
    calls = [];
    shouldFail = false;
    status = { status: 'NOT_PROVISIONED', admin: null, setup: null };
    issued = 0;
    const api = { apiFetch: async (path: string, options?: RequestInit) => {
      calls.push(`${options?.method || 'GET'} ${path}`);
      if (shouldFail) return jsonResponse({ error: { code: 'ACCOUNT_SETUP_URL_NOT_CONFIGURED', message: 'An unexpected server error occurred.' } }, 503);
      if (options?.method === 'POST') {
        if (path.endsWith('/revoke')) {
          status = { ...status, status: 'SETUP_EXPIRED' };
          return jsonResponse({ revokedCount: 1 });
        }
        issued += 1;
        status = { status: 'PENDING_SETUP', admin: { email: 'admin@example.com' }, setup: { expiresAt: new Date().toISOString() } };
        return jsonResponse({ setup: { setupUrl: `https://school.example.com/account/setup?token=test-token-${issued}` } }, issued === 1 ? 201 : 200);
      }
      return jsonResponse(status);
    } };
    await TestBed.configureTestingModule({
      imports: [PlatformAdminSetupComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: ConfirmDialogService, useValue: { confirm: async () => true } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PlatformAdminSetupComponent);
    fixture.componentRef.setInput('institutionId', 'institution-1');
    fixture.componentRef.setInput('institutionName', 'School');
    fixture.detectChanges();
    await fixture.componentInstance.load();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('shows the issue form when no first admin exists', () => {
    expect(fixture.nativeElement.textContent).toContain('إصدار رابط إعداد المدير');
    expect(fixture.nativeElement.textContent).toContain('لم يتم إعداد مدير أول');
    expect(calls).toContain('GET /api/platform/institutions/institution-1/initial-admin');
  });

  it('stops loading and shows an error when the status request fails', async () => {
    shouldFail = true;
    await fixture.componentInstance.load();
    fixture.detectChanges();
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.componentInstance.error()).toContain('تعذر تحميل');
  });

  it('issues a setup link through the platform endpoint', async () => {
    fixture.componentInstance.email.set('admin@example.com');
    fixture.componentInstance.firstNameAr.set('مدير');
    fixture.componentInstance.familyNameAr.set('المؤسسة');
    await fixture.componentInstance.issue();
    fixture.detectChanges();
    expect(calls).toContain('POST /api/platform/institutions/institution-1/initial-admin');
    expect(fixture.componentInstance.setupUrl()).toContain('token=test-token-1');
    expect(fixture.nativeElement.querySelector('input[readonly]').value).toContain('token=test-token-1');
    expect(fixture.nativeElement.textContent).toContain('يظهر رابط الإعداد لهذه العملية فقط');
  });

  it('replaces the displayed link on reissue and clears it on revoke', async () => {
    fixture.componentInstance.email.set('admin@example.com');
    fixture.componentInstance.firstNameAr.set('مدير');
    fixture.componentInstance.familyNameAr.set('المؤسسة');
    await fixture.componentInstance.issue();
    await fixture.componentInstance.reissue();
    expect(fixture.componentInstance.setupUrl()).toContain('token=test-token-2');
    expect(fixture.componentInstance.setupUrl()).not.toContain('token=test-token-1');
    await fixture.componentInstance.revoke();
    expect(fixture.componentInstance.setupUrl()).toBe('');
    expect(calls).toContain('POST /api/platform/institutions/institution-1/initial-admin/revoke');
  });

  it('never recovers a one-time link from status and clears it on close or institution change', async () => {
    fixture.componentInstance.email.set('admin@example.com');
    fixture.componentInstance.firstNameAr.set('مدير');
    fixture.componentInstance.familyNameAr.set('المؤسسة');
    await fixture.componentInstance.issue();
    fixture.componentInstance.close();
    expect(fixture.componentInstance.setupUrl()).toBe('');
    await fixture.componentInstance.load();
    expect(fixture.componentInstance.setupUrl()).toBe('');
    await fixture.componentInstance.reissue();
    fixture.componentRef.setInput('institutionId', 'institution-2');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.setupUrl()).toBe('');
  });

  it('copies the current link and shows feedback without exposing it in messages', async () => {
    fixture.componentInstance.email.set('admin@example.com');
    fixture.componentInstance.firstNameAr.set('مدير');
    fixture.componentInstance.familyNameAr.set('المؤسسة');
    await fixture.componentInstance.issue();
    const previousClipboard = navigator.clipboard;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      await fixture.componentInstance.copySetupLink();
      expect(writeText).toHaveBeenCalledWith(fixture.componentInstance.setupUrl());
      expect(fixture.componentInstance.copyFeedback()).toBe('تم نسخ الرابط.');
      writeText.mockRejectedValue(new Error('clipboard unavailable'));
      await fixture.componentInstance.copySetupLink();
      expect(fixture.componentInstance.copyFeedback()).toBe('تعذر نسخ الرابط. انسخه يدويًا.');
    } finally {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: previousClipboard });
    }
  });

  it('shows production URL configuration errors inside the modal', async () => {
    shouldFail = true;
    await fixture.componentInstance.reissue();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('عنوان إعداد الحساب غير مهيأ');
  });
});
