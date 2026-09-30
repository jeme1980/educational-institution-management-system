import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../../app.routes';
import { AuthService } from '../../../core/services/auth.service';
import { SurveyImportError, SurveyPreviewError, SurveysApiService } from '../../../core/services/surveys-api.service';
import type { SurveyDetail, SurveyResultsImportResponse, SurveyResultsPreviewResponse, SurveyRound, SurveyStructureResponse } from '../models/survey.model';
import { SurveyResultsPreviewComponent } from './survey-results-preview.component';

const survey: SurveyDetail = { id: 'survey-1', academicYearId: 'year-1', nameAr: 'استبيان المدرسة', nameHe: null, descriptionAr: null, descriptionHe: null, audienceType: null, status: 'ACTIVE', isActive: true, archivedAt: null, createdAt: '', updatedAt: '' };
const round: SurveyRound = { id: 'round-1', surveyId: survey.id, academicYearId: survey.academicYearId, code: 'ROUND_1', nameAr: 'الجولة الأولى', nameHe: null, sequenceNumber: 1, startsAt: null, endsAt: null, measurementDate: null, status: 'OPEN', closedAt: null, createdAt: '', updatedAt: '' };
const summary = { indicatorRowsTotal: 2, indicatorRowsValid: 1, domainRowsTotal: 3, domainRowsValid: 2, comparisonRowsTotal: 4, comparisonRowsValid: 3, participationRowsTotal: 5, participationRowsValid: 4, errorCount: 1 };
const validResult: SurveyResultsPreviewResponse = { valid: true, context: { surveyId: survey.id, roundId: round.id }, summary, errors: [] };
const importedResult: SurveyResultsImportResponse = { importBatchId: 'batch-1', surveyId: survey.id, roundId: round.id, status: 'COMPLETED', rowCount: 14, validRowCount: 14, invalidRowCount: 0, fileHash: 'hash', importedAt: '2026-09-30T00:00:00.000Z' };

describe('SurveyResultsPreviewComponent', () => {
  let fixture: ComponentFixture<SurveyResultsPreviewComponent>;
  const canUpdate = signal(true);
  const getSurveyStructure = vi.fn<(id: string) => Promise<SurveyStructureResponse>>();
  const previewSurveyResults = vi.fn<(surveyId: string, roundId: string, file: File) => Promise<SurveyResultsPreviewResponse>>();
  const downloadSurveyResultsTemplate = vi.fn<() => Promise<Blob>>();
  const importSurveyResults = vi.fn<(surveyId: string, roundId: string, file: File) => Promise<SurveyResultsImportResponse>>();
  const paramMap = convertToParamMap({ surveyId: survey.id, roundId: round.id });
  const render = async () => {
    fixture = TestBed.createComponent(SurveyResultsPreviewComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const selectFile = (file: File) => {
    const input = fixture.debugElement.query(By.css('#survey-results-file')).nativeElement as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  const previewFile = async (file = new File(['xlsx'], 'results.xlsx')) => {
    await render();
    selectFile(file);
    await fixture.componentInstance.runPreview();
    fixture.detectChanges();
    return file;
  };

  beforeEach(async () => {
    canUpdate.set(true);
    getSurveyStructure.mockReset().mockResolvedValue({ survey, rounds: [round], sections: [], segments: [] });
    previewSurveyResults.mockReset().mockResolvedValue(validResult);
    downloadSurveyResultsTemplate.mockReset().mockResolvedValue(new Blob(['xlsx']));
    importSurveyResults.mockReset().mockResolvedValue(importedResult);
    await TestBed.configureTestingModule({
      imports: [SurveyResultsPreviewComponent],
      providers: [provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap }, paramMap: of(paramMap) } },
        { provide: AuthService, useValue: { hasPermission: (permission: string) => permission === 'surveys:read' || (permission === 'surveys:update' && canUpdate()) } },
        { provide: SurveysApiService, useValue: { getSurveyStructure, previewSurveyResults, downloadSurveyResultsTemplate, importSurveyResults } },
      ],
    }).compileComponents();
  });

  it('loads direct route context from backend and shows no import execution', async () => {
    expect(routes.find(route => route.path === 'surveys/:surveyId/rounds/:roundId/results/import')?.data?.['requiredPermission']).toBe('surveys:read');
    await render();
    expect(getSurveyStructure).toHaveBeenCalledWith(survey.id);
    expect(fixture.nativeElement.textContent).toContain(survey.nameAr);
    expect(fixture.nativeElement.textContent).toContain(round.nameAr);
    expect(fixture.nativeElement.textContent).not.toContain('تأكيد الاستيراد');
    expect(fixture.debugElement.query(By.css('ui-pagination'))).toBeNull();
    expect(fixture.debugElement.query(By.css('#survey-results-file'))).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('تنزيل قالب Excel');
    expect(fixture.nativeElement.textContent).not.toContain('استيراد النتائج');
  });

  it('downloads the backend Blob with the official filename', async () => {
    await render();
    const createObjectURL = vi.fn().mockReturnValue('blob:template');
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    try {
      await fixture.componentInstance.downloadTemplate();
      expect(downloadSurveyResultsTemplate).toHaveBeenCalledOnce();
      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(click).toHaveBeenCalledOnce();
      expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe('survey-results-template.xlsx');
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:template');
    } finally {
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreate });
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevoke });
      click.mockRestore();
    }
  });

  it('shows a friendly template download failure and keeps preview available', async () => {
    downloadSurveyResultsTemplate.mockRejectedValue(new Error('private download failure'));
    await render();
    await fixture.componentInstance.downloadTemplate();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('تعذر تنزيل قالب Excel');
    expect(fixture.nativeElement.textContent).not.toContain('private download failure');
    expect(fixture.debugElement.query(By.css('#survey-results-file'))).not.toBeNull();
  });

  it('rejects missing round on direct refresh and keeps preview unavailable to readers', async () => {
    getSurveyStructure.mockResolvedValueOnce({ survey, rounds: [], sections: [], segments: [] });
    await render();
    expect(fixture.nativeElement.textContent).toContain('الجولة غير موجودة');
    expect(fixture.debugElement.query(By.css('#survey-results-file'))).toBeNull();
    canUpdate.set(false);
    await fixture.componentInstance.retry();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('صلاحية تعديل الاستبيانات مطلوبة');
    expect(fixture.debugElement.query(By.css('#survey-results-file'))).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('تنزيل قالب Excel');
    expect(fixture.nativeElement.textContent).not.toContain('استيراد النتائج');
  });

  it('shows archived Survey context without offering the file picker', async () => {
    getSurveyStructure.mockResolvedValue({ survey: { ...survey, archivedAt: '2026-01-01' }, rounds: [round], sections: [], segments: [] });
    await render();
    expect(fixture.nativeElement.textContent).toContain('لا يمكن فحص نتائج استبيان مؤرشف.');
    expect(fixture.debugElement.query(By.css('#survey-results-file'))).toBeNull();
    expect(previewSurveyResults).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).not.toContain('استيراد النتائج');
  });

  it('accepts XLSX, shows its filename, sends preview once, and renders four summary categories', async () => {
    previewSurveyResults.mockResolvedValue({ ...validResult, summary: { ...summary, indicatorRowsTotal: 1, domainRowsTotal: 0, comparisonRowsTotal: 0, participationRowsTotal: 0 } });
    await render();
    const file = new File(['xlsx'], 'results.xlsx');
    selectFile(file);
    expect(fixture.nativeElement.textContent).toContain('results.xlsx');
    await fixture.componentInstance.runPreview();
    fixture.detectChanges();
    expect(previewSurveyResults).toHaveBeenCalledOnce();
    expect(previewSurveyResults).toHaveBeenCalledWith(survey.id, round.id, file);
    expect(fixture.componentInstance.isPreviewImportReady()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('الملف صالح للاستيراد.');
    expect(fixture.nativeElement.textContent).toContain('استيراد النتائج');
    expect(fixture.debugElement.queryAll(By.css('section[aria-label="نتيجة فحص الملف"] tbody tr')).length).toBe(4);
    for (const label of ['نتائج المؤشرات', 'نتائج المجالات', 'المقارنات', 'المشاركة', 'إجمالي الأخطاء']) expect(fixture.nativeElement.textContent).toContain(label);
  });

  it('shows a structurally valid empty workbook without claiming it is import-ready', async () => {
    previewSurveyResults.mockResolvedValue({ ...validResult, summary: {
      indicatorRowsTotal: 0, indicatorRowsValid: 0, domainRowsTotal: 0, domainRowsValid: 0,
      comparisonRowsTotal: 0, comparisonRowsValid: 0, participationRowsTotal: 0, participationRowsValid: 0, errorCount: 0,
    } });
    await render();
    selectFile(new File(['xlsx'], 'any-empty-file.xlsx'));
    await fixture.componentInstance.runPreview();
    fixture.detectChanges();
    expect(fixture.componentInstance.previewTotalRows()).toBe(0);
    expect(fixture.componentInstance.isPreviewImportReady()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('الملف صالح من حيث البنية، لكنه لا يحتوي على نتائج للاستيراد.');
    expect(fixture.nativeElement.textContent).not.toContain('الملف صالح للاستيراد.');
    expect(fixture.debugElement.query(By.css('.preview-result-empty'))).not.toBeNull();
    expect(fixture.debugElement.queryAll(By.css('section[aria-label="نتيجة فحص الملف"] tbody tr')).length).toBe(4);
    expect(fixture.debugElement.queryAll(By.css('section[aria-label="نتيجة فحص الملف"] tbody td')).map(cell => cell.nativeElement.textContent.trim())).toEqual(Array(8).fill('0'));
    expect(fixture.debugElement.query(By.css('section[aria-label="أخطاء التحقق"]'))).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('تأكيد الاستيراد');
    expect(fixture.nativeElement.textContent).not.toContain('استيراد النتائج');
  });

  it('requires confirmation, cancels without a write, and imports the exact previewed File once', async () => {
    const file = await previewFile();
    fixture.componentInstance.openImportConfirmation();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('تأكيد استيراد النتائج');
    expect(fixture.nativeElement.textContent).toContain('ولا يمكن استيراد ملف آخر للجولة');
    fixture.componentInstance.cancelImport();
    expect(importSurveyResults).not.toHaveBeenCalled();

    let finish!: (result: SurveyResultsImportResponse) => void;
    importSurveyResults.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    fixture.componentInstance.openImportConfirmation();
    const pending = fixture.componentInstance.confirmImport();
    await fixture.componentInstance.confirmImport();
    fixture.detectChanges();
    expect(importSurveyResults).toHaveBeenCalledOnce();
    expect(importSurveyResults).toHaveBeenCalledWith(survey.id, round.id, file);
    expect(fixture.componentInstance.importing()).toBe(true);
    expect(fixture.nativeElement.querySelector('ui-confirm-dialog button:disabled')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('نتيجة الفحص');
    expect(fixture.nativeElement.textContent).not.toContain('استبدال النتائج');
    finish(importedResult);
    await pending;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('تم استيراد نتائج الجولة بنجاح. عدد الصفوف المستوردة: 14.');
    expect(fixture.nativeElement.textContent).not.toContain('استيراد النتائج');
    expect(fixture.componentInstance.canImport()).toBe(false);
    fixture.componentInstance.openImportConfirmation();
    await fixture.componentInstance.confirmImport();
    expect(importSurveyResults).toHaveBeenCalledOnce();
    expect(fixture.debugElement.query(By.css('ui-pagination'))).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('الرسم البياني');
  });

  it('removes import readiness when a different file is selected after preview', async () => {
    await previewFile();
    selectFile(new File(['other'], 'other.xlsx'));
    expect(fixture.componentInstance.canImport()).toBe(false);
    fixture.componentInstance.openImportConfirmation();
    await fixture.componentInstance.confirmImport();
    expect(importSurveyResults).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).not.toContain('استيراد النتائج');
  });

  it.each([
    ['SURVEY_IMPORT_DUPLICATE_FILE', 'تم استيراد هذا الملف لهذه الجولة مسبقًا.'],
    ['SURVEY_ROUND_RESULTS_ALREADY_EXIST', 'توجد نتائج مسجلة لهذه الجولة بالفعل، ولا يمكن استيراد ملف آخر.'],
    ['SURVEY_IMPORT_PREVIEW_INVALID', 'لم يعد الملف صالحًا للاستيراد. افحص الملف مرة أخرى.'],
    ['SURVEY_IMPORT_EMPTY', 'الملف لا يحتوي على نتائج للاستيراد.'],
    ['SURVEY_NOT_FOUND', 'الاستبيان غير موجود أو غير متاح.'],
    ['SURVEY_ROUND_NOT_FOUND', 'الجولة غير موجودة أو لا تتبع هذا الاستبيان.'],
    ['SURVEY_ARCHIVED', 'لا يمكن استيراد نتائج لاستبيان مؤرشف.'],
  ])('maps import error %s without exposing the backend code', async (code, message) => {
    importSurveyResults.mockRejectedValue(new SurveyImportError(code));
    await previewFile();
    fixture.componentInstance.openImportConfirmation();
    await fixture.componentInstance.confirmImport();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(message);
    expect(fixture.nativeElement.textContent).not.toContain(code);
    expect(fixture.componentInstance.importResult()).toBeNull();
    expect(fixture.componentInstance.canImport()).toBe(false);
    if (code === 'SURVEY_IMPORT_PREVIEW_INVALID' || code === 'SURVEY_IMPORT_EMPTY') expect(fixture.componentInstance.preview()).toBeNull();
    if (code === 'SURVEY_IMPORT_DUPLICATE_FILE' || code === 'SURVEY_ROUND_RESULTS_ALREADY_EXIST') {
      selectFile(new File(['other'], 'other.xlsx'));
      expect(fixture.componentInstance.importError()).toBe(message);
      expect(fixture.componentInstance.canImport()).toBe(false);
    }
  });

  it('keeps the file and valid preview available after a network failure for an explicit retry', async () => {
    importSurveyResults.mockRejectedValueOnce(new Error('private network detail'));
    const file = await previewFile();
    fixture.componentInstance.openImportConfirmation();
    await fixture.componentInstance.confirmImport();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('تعذر استيراد النتائج. حاول مرة أخرى.');
    expect(fixture.nativeElement.textContent).not.toContain('private network detail');
    expect(fixture.componentInstance.selectedFile()).toBe(file);
    expect(fixture.componentInstance.preview()).toEqual(validResult);
    expect(fixture.componentInstance.canImport()).toBe(true);
    fixture.componentInstance.openImportConfirmation();
    await fixture.componentInstance.confirmImport();
    expect(importSurveyResults).toHaveBeenCalledTimes(2);
  });

  it('rejects non-XLSX and files larger than 10 MB before calling preview', async () => {
    await render();
    selectFile(new File(['x'], 'results.xls'));
    expect(fixture.nativeElement.textContent).toContain('.xlsx فقط');
    await fixture.componentInstance.runPreview();
    selectFile(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.xlsx'));
    expect(fixture.nativeElement.textContent).toContain('يتجاوز الحد');
    await fixture.componentInstance.runPreview();
    expect(previewSurveyResults).not.toHaveBeenCalled();
  });

  it('renders invalid HTTP 200 validation errors with source sheet, row, column, and message', async () => {
    previewSurveyResults.mockResolvedValue({ ...validResult, valid: false, errors: [{ sheet: 'IndicatorResults', row: 7, column: 'reportedPercentage', code: 'INVALID_PERCENTAGE', message: 'القيمة غير صالحة' }] });
    await render();
    selectFile(new File(['x'], 'bad.xlsx'));
    await fixture.componentInstance.runPreview();
    fixture.detectChanges();
    expect(fixture.componentInstance.isPreviewImportReady()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('الملف يحتاج إلى تصحيح قبل الاستيراد.');
    expect(fixture.nativeElement.textContent).not.toContain('استيراد النتائج');
    const row = fixture.debugElement.query(By.css('section[aria-label="أخطاء التحقق"] tbody tr')).nativeElement.textContent;
    for (const value of ['IndicatorResults', '7', 'reportedPercentage', 'القيمة غير صالحة']) expect(row).toContain(value);
    expect(fixture.nativeElement.textContent).not.toContain('تعذر فحص الملف');
  });

  it('clears the old preview immediately when a new file is selected', async () => {
    await render();
    selectFile(new File(['x'], 'first.xlsx'));
    await fixture.componentInstance.runPreview();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('الملف صالح للاستيراد.');
    selectFile(new File(['x'], 'second.xlsx'));
    expect(fixture.nativeElement.textContent).toContain('second.xlsx');
    expect(fixture.nativeElement.textContent).not.toContain('الملف صالح للاستيراد.');
    expect(fixture.nativeElement.textContent).not.toContain('استيراد النتائج');
  });

  it('maps backend errors to Arabic and prevents double-submit', async () => {
    let reject!: (error: Error) => void;
    previewSurveyResults.mockImplementationOnce(() => new Promise((_resolve, rejected) => { reject = rejected; }));
    await render();
    selectFile(new File(['x'], 'results.xlsx'));
    const pending = fixture.componentInstance.runPreview();
    await fixture.componentInstance.runPreview();
    expect(previewSurveyResults).toHaveBeenCalledTimes(1);
    reject(new SurveyPreviewError('SURVEY_ROUND_NOT_FOUND'));
    await pending;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('الجولة غير موجودة أو لا تتبع هذا الاستبيان.');
  });

  it('uses context error and retry when the structure request fails', async () => {
    getSurveyStructure.mockRejectedValueOnce(new Error('private database failure'));
    await render();
    expect(fixture.nativeElement.textContent).toContain('تعذر تحميل الاستبيان والجولة');
    expect(fixture.nativeElement.textContent).not.toContain('private database failure');
    await fixture.componentInstance.retry();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('ملف نتائج الاستبيان');
  });
});
