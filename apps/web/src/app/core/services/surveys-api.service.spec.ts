import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { SurveysApiService } from './surveys-api.service';

describe('SurveysApiService', () => {
  it('requests the complete list for the selected academic year', async () => {
    TestBed.configureTestingModule({ providers: [
      SurveysApiService,
      { provide: AuthService, useValue: { idToken: signal(null), currentContext: signal(null), waitForAuthInit: vi.fn().mockResolvedValue(undefined) } },
      { provide: Router, useValue: { navigate: vi.fn() } },
    ] });
    const service = TestBed.inject(SurveysApiService);
    const items = [{ id: 'survey-1', nameAr: 'استبيان', roundCount: 2 }];
    const apiFetch = vi.spyOn(service, 'apiFetch').mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(items) } as unknown as Response);

    expect(await service.getSurveys('year-1')).toEqual(items);
    expect(apiFetch).toHaveBeenCalledWith('/api/surveys?academicYearId=year-1');
  });
});
