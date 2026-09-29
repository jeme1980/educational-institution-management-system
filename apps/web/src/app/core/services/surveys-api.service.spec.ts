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
    const result = { survey: { id: 'survey-1' }, sections: [], rounds: [], segments: [] };
    const apiFetch = vi.spyOn(service, 'apiFetch').mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(result) } as unknown as Response);
    expect(await service.getSurveyStructure('survey-1')).toEqual(result);
    await service.createSurveyRound('survey-1', { code: 'R1', nameAr: 'الجولة الأولى', sequenceNumber: 1 });
    await service.updateSurveyRound('survey-1', 'round-1', { nameAr: 'جولة محدثة' });
    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/surveys/survey-1/structure');
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/surveys/survey-1/rounds', expect.objectContaining({ method: 'POST', body: JSON.stringify({ code: 'R1', nameAr: 'الجولة الأولى', sequenceNumber: 1 }) }));
    expect(apiFetch).toHaveBeenNthCalledWith(3, '/api/surveys/survey-1/rounds/round-1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ nameAr: 'جولة محدثة' }) }));
  });

  it('writes Sections and Domains through their survey-scoped routes', async () => {
    TestBed.configureTestingModule({ providers: [
      SurveysApiService,
      { provide: AuthService, useValue: { idToken: signal(null), currentContext: signal(null), waitForAuthInit: vi.fn().mockResolvedValue(undefined) } },
      { provide: Router, useValue: { navigate: vi.fn() } },
    ] });
    const service = TestBed.inject(SurveysApiService);
    const apiFetch = vi.spyOn(service, 'apiFetch').mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ id: 'child-1' }) } as unknown as Response);
    await service.createSurveySection('survey-1', { code: 'S1', nameAr: 'قسم', sortOrder: 0 });
    await service.updateSurveySection('survey-1', 'section-1', { nameAr: 'قسم معدل' });
    await service.createSurveyDomain('survey-1', { sectionId: 'section-1', code: 'D1', nameAr: 'مجال' });
    await service.updateSurveyDomain('survey-1', 'domain-1', { sectionId: 'section-2', nameAr: 'مجال معدل' });
    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/surveys/survey-1/sections', expect.objectContaining({ method: 'POST', body: JSON.stringify({ code: 'S1', nameAr: 'قسم', sortOrder: 0 }) }));
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/surveys/survey-1/sections/section-1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ nameAr: 'قسم معدل' }) }));
    expect(apiFetch).toHaveBeenNthCalledWith(3, '/api/surveys/survey-1/domains', expect.objectContaining({ method: 'POST', body: JSON.stringify({ sectionId: 'section-1', code: 'D1', nameAr: 'مجال' }) }));
    expect(apiFetch).toHaveBeenNthCalledWith(4, '/api/surveys/survey-1/domains/domain-1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ sectionId: 'section-2', nameAr: 'مجال معدل' }) }));
  });

  it('writes Indicators through survey-scoped routes with the selected Domain in create only', async () => {
    TestBed.configureTestingModule({ providers: [
      SurveysApiService,
      { provide: AuthService, useValue: { idToken: signal(null), currentContext: signal(null), waitForAuthInit: vi.fn().mockResolvedValue(undefined) } },
      { provide: Router, useValue: { navigate: vi.fn() } },
    ] });
    const service = TestBed.inject(SurveysApiService);
    const apiFetch = vi.spyOn(service, 'apiFetch').mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ id: 'indicator-1' }) } as unknown as Response);
    await service.createSurveyIndicator('survey-1', { domainId: 'domain-1', code: 'I1', textAr: 'مؤشر', reportingRuleCode: 'DIRECT_PERCENT', isReverseDirection: true });
    await service.updateSurveyIndicator('survey-1', 'indicator-1', { descriptionAr: 'وصف', sortOrder: 2 });
    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/surveys/survey-1/indicators', expect.objectContaining({ method: 'POST', body: JSON.stringify({ domainId: 'domain-1', code: 'I1', textAr: 'مؤشر', reportingRuleCode: 'DIRECT_PERCENT', isReverseDirection: true }) }));
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/surveys/survey-1/indicators/indicator-1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ descriptionAr: 'وصف', sortOrder: 2 }) }));
  });

  it('writes Segments through survey-scoped routes without Section or Domain IDs', async () => {
    TestBed.configureTestingModule({ providers: [
      SurveysApiService,
      { provide: AuthService, useValue: { idToken: signal(null), currentContext: signal(null), waitForAuthInit: vi.fn().mockResolvedValue(undefined) } },
      { provide: Router, useValue: { navigate: vi.fn() } },
    ] });
    const service = TestBed.inject(SurveysApiService);
    const apiFetch = vi.spyOn(service, 'apiFetch').mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ id: 'segment-1' }) } as unknown as Response);
    await service.createSurveySegment('survey-1', { code: 'G1', nameAr: 'شريحة', segmentType: 'custom' });
    await service.updateSurveySegment('survey-1', 'segment-1', { nameAr: 'شريحة معدلة', isActive: false });
    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/surveys/survey-1/segments', expect.objectContaining({ method: 'POST', body: JSON.stringify({ code: 'G1', nameAr: 'شريحة', segmentType: 'custom' }) }));
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/surveys/survey-1/segments/segment-1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ nameAr: 'شريحة معدلة', isActive: false }) }));
  });
});
