import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { AuthService } from './auth.service';
import { SettingsApiService } from './settings-api.service';

describe('SettingsApiService academic periods', () => {
  let service: SettingsApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      SettingsApiService,
      { provide: AuthService, useValue: { idToken: signal(null), currentContext: signal(null), waitForAuthInit: vi.fn().mockResolvedValue(undefined), refreshSession: vi.fn() } },
      { provide: Router, useValue: { navigate: vi.fn() } },
    ] });
    service = TestBed.inject(SettingsApiService);
  });

  it('keeps the created period in the visible list after a successful request', async () => {
    const created = { id: 'period-1', institutionId: 'school', academicYearId: 'year-1', nameAr: 'فصل 01', nameHe: null, startDate: '2026-09-01', endDate: '2026-12-31', sortOrder: 1, isActive: true };
    vi.spyOn(service, 'apiFetch').mockResolvedValue(new Response(JSON.stringify(created), { status: 201, headers: { 'Content-Type': 'application/json; charset=utf-8' } }));

    const result = await service.createAcademicPeriod({ ...created, id: undefined });

    expect(result).toEqual({ success: true, data: created });
    expect(service.academicPeriods()).toEqual([created]);
  });

  it('reads an Arabic API error once and preserves its code without decoding the text', async () => {
    const json = vi.fn().mockResolvedValue({ code: 'ACADEMIC_PERIOD_OUTSIDE_YEAR_RANGE', error: 'يجب أن تقع تواريخ الفترة الدراسية ضمن نطاق السنة الأكاديمية.' });
    vi.spyOn(service, 'apiFetch').mockResolvedValue({ ok: false, json } as unknown as Response);

    const result = await service.createAcademicPeriod({});

    expect(result).toEqual({ success: false, code: 'ACADEMIC_PERIOD_OUTSIDE_YEAR_RANGE', error: 'يجب أن تقع تواريخ الفترة الدراسية ضمن نطاق السنة الأكاديمية.' });
    expect(json).toHaveBeenCalledTimes(1);
  });

  it('uses a readable Arabic fallback when the API has no message', async () => {
    vi.spyOn(service, 'apiFetch').mockResolvedValue({ ok: false, json: vi.fn().mockResolvedValue({}) } as unknown as Response);
    expect(await service.createAcademicPeriod({})).toEqual({ success: false, error: 'تعذر حفظ الفترة الدراسية.' });
  });
});
