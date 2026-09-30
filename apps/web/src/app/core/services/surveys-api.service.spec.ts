import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { SurveyImportError, SurveysApiService } from './surveys-api.service';

describe('SurveysApiService', () => {
  it('downloads the official survey results template as a Blob', async () => {
    TestBed.configureTestingModule({ providers: [
      SurveysApiService,
      { provide: AuthService, useValue: { idToken: signal(null), currentContext: signal(null), waitForAuthInit: vi.fn().mockResolvedValue(undefined) } },
      { provide: Router, useValue: { navigate: vi.fn() } },
    ] });
    const service = TestBed.inject(SurveysApiService);
    const blob = new Blob(['xlsx']);
    const apiFetch = vi.spyOn(service, 'apiFetch').mockResolvedValue({ ok: true, blob: vi.fn().mockResolvedValue(blob) } as unknown as Response);
    expect(await service.downloadSurveyResultsTemplate()).toBe(blob);
    expect(apiFetch).toHaveBeenCalledWith('/api/surveys/results/template');
  });
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

  it('previews an XLSX using FormData with browser-managed multipart headers', async () => {
    TestBed.configureTestingModule({ providers: [
      SurveysApiService,
      { provide: AuthService, useValue: { idToken: signal(null), currentContext: signal(null), waitForAuthInit: vi.fn().mockResolvedValue(undefined) } },
      { provide: Router, useValue: { navigate: vi.fn() } },
    ] });
    const service = TestBed.inject(SurveysApiService);
    const result = { valid: true, context: { surveyId: 'survey-1', roundId: 'round-1' }, summary: {}, errors: [] };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: vi.fn().mockResolvedValue(result) } as unknown as Response);
    try {
      const file = new File(['xlsx'], 'results.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      expect(await service.previewSurveyResults('survey-1', 'round-1', file)).toEqual(result);
      const [path, options] = fetchSpy.mock.calls[0];
      expect(path).toBe('/api/surveys/survey-1/rounds/round-1/results/preview');
      expect(options?.method).toBe('POST');
      expect(options?.headers).not.toHaveProperty('Content-Type');
      expect((options?.body as FormData).get('file')).toBe(file);
    } finally { fetchSpy.mockRestore(); }
  });

  it('imports one XLSX with a single multipart request and returns the backend response', async () => {
    TestBed.configureTestingModule({ providers: [
      SurveysApiService,
      { provide: AuthService, useValue: { idToken: signal(null), currentContext: signal(null), waitForAuthInit: vi.fn().mockResolvedValue(undefined) } },
      { provide: Router, useValue: { navigate: vi.fn() } },
    ] });
    const service = TestBed.inject(SurveysApiService);
    const result = { importBatchId: 'batch-1', surveyId: 'survey-1', roundId: 'round-1', status: 'COMPLETED', rowCount: 1, validRowCount: 1, invalidRowCount: 0, fileHash: 'hash', importedAt: '2026-09-30T00:00:00.000Z' };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 201, json: vi.fn().mockResolvedValue(result) } as unknown as Response);
    try {
      const file = new File(['xlsx'], 'results.xlsx');
      expect(await service.importSurveyResults('survey-1', 'round-1', file)).toEqual(result);
      expect(fetchSpy).toHaveBeenCalledOnce();
      const [path, options] = fetchSpy.mock.calls[0];
      expect(path).toBe('/api/surveys/survey-1/rounds/round-1/results/import');
      expect(options?.method).toBe('POST');
      expect(options?.headers).not.toHaveProperty('Content-Type');
      expect((options?.body as FormData).get('file')).toBe(file);
    } finally { fetchSpy.mockRestore(); }
  });

  it('preserves the import error code for user-facing conflict handling', async () => {
    TestBed.configureTestingModule({ providers: [
      SurveysApiService,
      { provide: AuthService, useValue: { idToken: signal(null), currentContext: signal(null), waitForAuthInit: vi.fn().mockResolvedValue(undefined) } },
      { provide: Router, useValue: { navigate: vi.fn() } },
    ] });
    const service = TestBed.inject(SurveysApiService);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 409, json: vi.fn().mockResolvedValue({ error: { code: 'SURVEY_ROUND_RESULTS_ALREADY_EXIST' } }) } as unknown as Response);
    try {
      await expect(service.importSurveyResults('survey-1', 'round-1', new File(['xlsx'], 'results.xlsx')))
        .rejects.toMatchObject({ code: 'SURVEY_ROUND_RESULTS_ALREADY_EXIST' } satisfies Partial<SurveyImportError>);
    } finally { fetchSpy.mockRestore(); }
  });
});
