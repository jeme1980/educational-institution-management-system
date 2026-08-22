import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApiService } from '../../core/services/api.service';
import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';
import { PlatformInstitutionsComponent } from './platform-institutions.component';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('PlatformInstitutionsComponent subscription onboarding', () => {
  let fixture: ComponentFixture<PlatformInstitutionsComponent>;
  let calls: { path: string; options?: RequestInit }[];
  const plan = { id: 'plan-1', code: 'STANDARD', nameAr: 'Standard', maxStudents: 500, isActive: true };
  const formValue = { schoolCode: 'SCH001', slug: 'school-001', nameAr: 'School', nameHe: '', phoneNumber: '', email: '', typeId: 'type-1', regionId: 'region-1', townId: '', statusId: 'status-1', defaultLanguageId: 'lang-1', planId: 'plan-1', logoUrl: '' };

  beforeEach(async () => {
    calls = [];
    const api = { apiFetch: async (path: string, options?: RequestInit) => {
      calls.push({ path, options });
      if (path === '/api/platform/plans') return jsonResponse([plan]);
      if (path === '/api/lookups') return jsonResponse({ towns: [] });
      if (!options?.method) return jsonResponse([]);
      return jsonResponse({ id: 'institution-1' }, options.method === 'POST' ? 201 : 200);
    } };
    await TestBed.configureTestingModule({ imports: [PlatformInstitutionsComponent], providers: [{ provide: ApiService, useValue: api }, { provide: ConfirmDialogService, useValue: {} }] }).compileComponents();
    fixture = TestBed.createComponent(PlatformInstitutionsComponent);
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('loads active plans and sends the selected plan only on create', async () => {
    expect(fixture.componentInstance.activePlans()).toEqual([plan]);
    fixture.componentInstance.openCreate();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="institution-plan-select"]')).not.toBeNull();
    fixture.componentInstance.form.patchValue(formValue);
    await fixture.componentInstance.save();
    const create = calls.find((call) => call.options?.method === 'POST');
    expect(JSON.parse(String(create?.options?.body)).planId).toBe('plan-1');
  });

  it('does not include planId in edit payloads', async () => {
    fixture.componentInstance.openEdit({ id: 'institution-1', ...formValue });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="institution-plan-select"]')).toBeNull();
    fixture.componentInstance.form.patchValue({ nameAr: 'Updated', planId: 'plan-1' });
    await fixture.componentInstance.save();
    const update = calls.find((call) => call.options?.method === 'PATCH');
    expect(JSON.parse(String(update?.options?.body))).not.toHaveProperty('planId');
  });
});
