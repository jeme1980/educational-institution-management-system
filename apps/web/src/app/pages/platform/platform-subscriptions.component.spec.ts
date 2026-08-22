import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { PlatformSubscriptionsComponent } from './platform-subscriptions.component';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('PlatformSubscriptionsComponent', () => {
  let fixture: ComponentFixture<PlatformSubscriptionsComponent>;

  beforeEach(async () => {
    const rows = [
      { id: 'institution-1', nameAr: 'مدرسة النور', schoolCode: 'NOOR', plan: { nameAr: 'الخطة الأساسية', maxStudents: 100 }, subscription: { status: 'ACTIVE', startsAt: '2026-01-01T00:00:00.000Z', endsAt: null } },
      { id: 'institution-2', nameAr: 'مدرسة الأمل', schoolCode: 'AMAL', plan: null, subscription: null },
    ];
    const api = { apiFetch: async () => jsonResponse(rows) };
    await TestBed.configureTestingModule({ imports: [PlatformSubscriptionsComponent], providers: [{ provide: ApiService, useValue: api }, provideRouter([])] }).compileComponents();
    fixture = TestBed.createComponent(PlatformSubscriptionsComponent);
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('renders subscribed and no-plan institutions and filters by status', () => {
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(fixture.componentInstance.statusLabel({ subscription: null })).toBe('بلا اشتراك');
    fixture.componentInstance.statusFilter.set('ACTIVE');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('مدرسة النور');
    expect(fixture.nativeElement.textContent).not.toContain('مدرسة الأمل');
  });
});
