import { ComponentFixture, TestBed } from '@angular/core/testing';
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

  beforeEach(async () => {
    calls = [];
    const api = { apiFetch: async (path: string, options?: RequestInit) => {
      calls.push(`${options?.method || 'GET'} ${path}`);
      if (shouldFail) return jsonResponse({ error: 'failed' }, 500);
      if (options?.method === 'POST') return jsonResponse({ setup: { setupUrl: 'http://localhost:4200/account/setup?token=test-token' } }, 201);
      return jsonResponse({ status: 'NOT_PROVISIONED', admin: null, setup: null });
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
    expect(fixture.componentInstance.loading()).toBeFalse();
    expect(fixture.componentInstance.error()).toContain('تعذر تحميل');
  });

  it('issues a setup link through the platform endpoint', async () => {
    fixture.componentInstance.email.set('admin@example.com');
    fixture.componentInstance.firstNameAr.set('مدير');
    fixture.componentInstance.familyNameAr.set('المؤسسة');
    await fixture.componentInstance.issue();
    expect(calls).toContain('POST /api/platform/institutions/institution-1/initial-admin');
    expect(fixture.componentInstance.setupUrl()).toContain('token=test-token');
  });
});
