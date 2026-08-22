import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApiService } from '../../core/services/api.service';
import { PlatformPlansComponent } from './platform-plans.component';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('PlatformPlansComponent', () => {
  let fixture: ComponentFixture<PlatformPlansComponent>;
  let calls: { path: string; options?: RequestInit }[];
  const plans = [{ id: 'plan-1', code: 'STANDARD', nameAr: 'الخطة الأساسية', nameHe: null, maxStudents: 100, isActive: true }];

  beforeEach(async () => {
    calls = [];
    const api = { apiFetch: async (path: string, options?: RequestInit) => {
      calls.push({ path, options });
      if (!options?.method) return jsonResponse(plans);
      const body = JSON.parse(String(options.body || '{}'));
      if (options.method === 'POST') return jsonResponse({ id: 'plan-2', code: body.code, nameAr: body.nameAr, maxStudents: body.maxStudents, isActive: true }, 201);
      return jsonResponse({ ...plans[0], ...body });
    } };
    await TestBed.configureTestingModule({ imports: [PlatformPlansComponent], providers: [{ provide: ApiService, useValue: api }] }).compileComponents();
    fixture = TestBed.createComponent(PlatformPlansComponent);
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('opens edit with current values and sends an allowlisted PATCH', async () => {
    fixture.componentInstance.openEdit(plans[0]);
    fixture.componentInstance.form.nameAr = 'الخطة المحدثة';
    fixture.componentInstance.form.maxStudents = 120;
    await fixture.componentInstance.save();

    const update = calls.find((call) => call.options?.method === 'PATCH');
    expect(update?.path).toBe('/api/platform/plans/plan-1');
    expect(JSON.parse(String(update?.options?.body))).toEqual({ nameAr: 'الخطة المحدثة', nameHe: null, maxStudents: 120 });
    expect(fixture.componentInstance.showModal()).toBe(false);
  });

  it('creates a plan and supports activation toggling', async () => {
    fixture.componentInstance.openCreate();
    fixture.componentInstance.form = { code: 'starter', nameAr: 'خطة البداية', nameHe: '', maxStudents: '' };
    await fixture.componentInstance.save();
    const created = calls.find((call) => call.options?.method === 'POST');
    expect(JSON.parse(String(created?.options?.body))).toEqual({ code: 'starter', nameAr: 'خطة البداية', nameHe: null, maxStudents: null });

    await fixture.componentInstance.toggle(plans[0]);
    const toggle = calls.find((call) => call.options?.method === 'PATCH' && JSON.parse(String(call.options?.body)).isActive === false);
    expect(toggle?.path).toBe('/api/platform/plans/plan-1');
  });
});
