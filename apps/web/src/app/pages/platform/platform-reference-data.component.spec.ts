import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApiService } from '../../core/services/api.service';
import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';
import { PlatformReferenceDataComponent } from './platform-reference-data.component';

const initialRegion = { id: 'region-1', nameAr: 'منطقة أصلية', nameHe: null, sortOrder: 1, isActive: true };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('PlatformReferenceDataComponent save DOM flow', () => {
  let fixture: ComponentFixture<PlatformReferenceDataComponent>;
  let calls: { path: string; options?: RequestInit }[];
  let regions: any[];

  beforeEach(async () => {
    calls = [];
    regions = [{ ...initialRegion }];
    const api = {
      apiFetch: async (path: string, options?: RequestInit) => {
        calls.push({ path, options });
        if (!options?.method) return jsonResponse({ regions });
        const payload = JSON.parse(String(options.body || '{}'));
        if (options.method === 'POST') {
          const created = { id: 'region-2', ...payload };
          regions = [...regions, created];
          return jsonResponse(created, 201);
        }
        const id = path.split('/').pop();
        if (options.method === 'DELETE') {
          regions = regions.filter((item) => item.id !== id);
          return jsonResponse({ success: true, id });
        }
        const updated = { ...regions.find((item) => item.id === id), ...payload, id };
        regions = regions.map((item) => item.id === id ? updated : item);
        return jsonResponse(updated);
      },
    };

    await TestBed.configureTestingModule({
      imports: [PlatformReferenceDataComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: ConfirmDialogService, useValue: { confirm: async () => true } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PlatformReferenceDataComponent);
    await fixture.whenStable();
    fixture.detectChanges();
  });

  function setName(value: string): void {
    setInput('nameAr', value);
  }

  it('keeps the selected reference-data item on semantic active colors', () => {
    const selected = fixture.nativeElement.querySelector('nav button') as HTMLButtonElement;
    const icon = selected.querySelector('mat-icon') as HTMLElement;

    expect(selected.classList).toContain('bg-primary');
    expect(selected.classList).toContain('text-on-primary');
    expect(icon).toBeTruthy();
  });

  function setInput(name: string, value: string): void {
    const input = fixture.nativeElement.querySelector(`input[name="${name}"]`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  function clickSave(): void {
    const save = fixture.nativeElement.querySelector('button[type="submit"][form="platform-reference-data-form"]') as HTMLButtonElement;
    expect(save).toBeTruthy();
    save.click();
  }

  it('submits Create through the native DOM submit button', async () => {
    (fixture.nativeElement.querySelector('ui-button button') as HTMLButtonElement).click();
    fixture.detectChanges();
    setName('منطقة جديدة');
    clickSave();
    await fixture.whenStable();

    const create = calls.find((call) => call.options?.method === 'POST');
    expect(create?.path).toBe('/api/platform/reference-data/regions');
    expect(JSON.parse(String(create?.options?.body)).nameAr).toBe('منطقة جديدة');
    expect(fixture.componentInstance.showModal()).toBe(false);
  });

  it('submits Edit through the same native DOM submit button', async () => {
    const edit = fixture.nativeElement.querySelector('button[aria-label^="تعديل"]') as HTMLButtonElement;
    edit.click();
    fixture.detectChanges();
    setName('منطقة معدلة');
    clickSave();
    await fixture.whenStable();

    const update = calls.find((call) => call.options?.method === 'PATCH');
    expect(update?.path).toBe('/api/platform/reference-data/regions/region-1');
    expect(JSON.parse(String(update?.options?.body)).nameAr).toBe('منطقة معدلة');
    expect(fixture.componentInstance.showModal()).toBe(false);
  });

  it('submits Provider Create with the provider contract and normalized sort order', async () => {
    const providerTab = [...fixture.nativeElement.querySelectorAll('nav button')].find((button) => button.textContent?.includes('المزوّدون')) as HTMLButtonElement;
    providerTab.click();
    await fixture.whenStable();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('ui-button button') as HTMLButtonElement).click();
    fixture.detectChanges();
    setInput('providerCode', 'TEST-PROVIDER-001');
    setInput('name', 'مزود اختبار');
    setInput('sortOrder', '1');
    clickSave();
    await fixture.whenStable();

    const create = calls.find((call) => call.options?.method === 'POST');
    expect(create?.path).toBe('/api/platform/reference-data/providers');
    expect(JSON.parse(String(create?.options?.body))).toEqual({ providerCode: 'TEST-PROVIDER-001', name: 'مزود اختبار', sortOrder: 1, isActive: true });
    expect(fixture.componentInstance.showModal()).toBe(false);
  });

  it('updates a system Education Type with display fields only', async () => {
    fixture.componentInstance.activeTable.set('educationTypes');
    fixture.componentInstance.items.set([{ id: 'education-type-1', nameAr: 'تعليم عام', nameHe: 'חינוך כללי', sortOrder: 1, isActive: true, isSystem: true }]);
    fixture.componentInstance.openEdit(fixture.componentInstance.items()[0]);
    fixture.componentInstance.form.nameAr = 'تعليم محدث';
    await fixture.componentInstance.save();

    const update = calls.find((call) => call.options?.method === 'PATCH');
    expect(update?.path).toBe('/api/platform/reference-data/educationTypes/education-type-1');
    expect(JSON.parse(String(update?.options?.body))).toEqual({ nameAr: 'تعليم محدث', nameHe: 'חינוך כללי', sortOrder: 1 });
    expect(JSON.parse(String(update?.options?.body))).not.toHaveProperty('isActive');
    expect(fixture.componentInstance.showModal()).toBe(false);
  });

  it('removes a deleted row after a successful DELETE response', async () => {
    const remove = fixture.nativeElement.querySelector('button[aria-label^="حذف"]') as HTMLButtonElement;
    remove.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(calls.some((call) => call.options?.method === 'DELETE')).toBe(true);
    expect(fixture.nativeElement.textContent).not.toContain('منطقة أصلية');
  });
});
