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
  });
});
