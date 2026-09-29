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

  it('posts create and patches edit using their exact routes and bodies', async () => {
    TestBed.configureTestingModule({ providers: [
      SurveysApiService,
      { provide: AuthService, useValue: { idToken: signal(null), currentContext: signal(null), waitForAuthInit: vi.fn().mockResolvedValue(undefined) } },
      { provide: Router, useValue: { navigate: vi.fn() } },
    ] });
    const service = TestBed.inject(SurveysApiService);
    const apiFetch = vi.spyOn(service, 'apiFetch').mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ id: 'survey-1' }) } as unknown as Response);
    await service.createSurvey({ academicYearId: 'year-1', nameAr: 'استبيان', status: 'DRAFT' });
    await service.updateSurvey('survey-1', { nameAr: 'محدث', isActive: false });
    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/surveys', expect.objectContaining({ method: 'POST', body: JSON.stringify({ academicYearId: 'year-1', nameAr: 'استبيان', status: 'DRAFT' }) }));
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/surveys/survey-1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ nameAr: 'محدث', isActive: false }) }));
  });

  it('reads structure and writes rounds through survey-scoped routes without a year body', async () => {
    TestBed.configureTestingModule({ providers: [
      SurveysApiService,
      { provide: AuthService, useValue: { idToken: signal(null), currentContext: signal(null), waitForAuthInit: vi.fn().mockResolvedValue(undefined) } },
      { provide: Router, useValue: { navigate: vi.fn() } },
    ] });
    const service = TestBed.inject(SurveysApiService);
    const result = { survey: { id: 'survey-1' }, rounds: [] };
    const apiFetch = vi.spyOn(service, 'apiFetch').mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(result) } as unknown as Response);
    expect(await service.getSurveyStructure('survey-1')).toEqual(result);
    await service.createSurveyRound('survey-1', { code: 'R1', nameAr: 'الجولة الأولى', sequenceNumber: 1 });
    await service.updateSurveyRound('survey-1', 'round-1', { nameAr: 'جولة محدثة' });
    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/surveys/survey-1/structure');
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/surveys/survey-1/rounds', expect.objectContaining({ method: 'POST', body: JSON.stringify({ code: 'R1', nameAr: 'الجولة الأولى', sequenceNumber: 1 }) }));
    expect(apiFetch).toHaveBeenNthCalledWith(3, '/api/surveys/survey-1/rounds/round-1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ nameAr: 'جولة محدثة' }) }));
  });
});
