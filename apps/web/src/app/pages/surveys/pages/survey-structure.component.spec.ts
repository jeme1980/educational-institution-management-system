import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../../app.routes';
import { AuthService } from '../../../core/services/auth.service';
import { SurveyWriteError, SurveysApiService } from '../../../core/services/surveys-api.service';
import { SURVEY_INDICATOR_REPORTING_RULES } from '../models/survey.model';
import type { SurveyDetail, SurveyDomain, SurveyIndicator, SurveySection, SurveySegment, SurveyStructureResponse } from '../models/survey.model';
import { SurveyStructureComponent } from './survey-structure.component';

const survey: SurveyDetail = { id: 'survey-1', academicYearId: 'year-1', nameAr: 'استبيان', nameHe: null, descriptionAr: null, descriptionHe: null, audienceType: null, status: 'ACTIVE', isActive: true, archivedAt: null, createdAt: '', updatedAt: '' };
const indicator = (id: string, domainId: string): SurveyIndicator => ({ id, surveyId: survey.id, domainId, code: `I_${id}`, textAr: `مؤشر ${id}`, textHe: null, descriptionAr: null, descriptionHe: null, sortOrder: 0, isActive: true, reportingRuleCode: 'DIRECT_PERCENT', isReverseDirection: false });
const domain = (id: string, sectionId: string, indicators: SurveyIndicator[] = []): SurveyDomain => ({ id, surveyId: survey.id, sectionId, code: `D_${id}`, nameAr: `مجال ${id}`, nameHe: null, descriptionAr: null, descriptionHe: null, sortOrder: 0, isActive: true, indicators });
const section = (id: string, domains: SurveyDomain[] = []): SurveySection => ({ id, surveyId: survey.id, code: `S_${id}`, nameAr: `قسم ${id}`, nameHe: null, descriptionAr: null, descriptionHe: null, sortOrder: 0, isOptional: false, isActive: true, domains });
const sections = [section('first', [domain('one', 'first')]), section('second', [domain('two', 'second')])];
const segment = (id: string): SurveySegment => ({ id, surveyId: survey.id, code: `G_${id}`, nameAr: `شريحة ${id}`, nameHe: null, segmentType: null, sortOrder: 0, isActive: true });

describe('SurveyStructureComponent', () => {
  let fixture: ComponentFixture<SurveyStructureComponent>;
  const canUpdate = signal(false);
  const getSurveyStructure = vi.fn<(id: string) => Promise<SurveyStructureResponse>>();
  const createSurveySection = vi.fn();
  const updateSurveySection = vi.fn();
  const createSurveyDomain = vi.fn();
  const updateSurveyDomain = vi.fn();
  const createSurveyIndicator = vi.fn();
  const updateSurveyIndicator = vi.fn();
  const createSurveySegment = vi.fn();
  const updateSurveySegment = vi.fn();
  const paramMap = convertToParamMap({ surveyId: survey.id });
  const render = async () => {
    fixture = TestBed.createComponent(SurveyStructureComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    canUpdate.set(false);
    getSurveyStructure.mockReset().mockResolvedValue({ survey, sections, rounds: [], segments: [] });
    createSurveySection.mockReset().mockResolvedValue(section('new'));
    updateSurveySection.mockReset().mockResolvedValue(section('first'));
    createSurveyDomain.mockReset().mockResolvedValue(domain('new', 'first'));
    updateSurveyDomain.mockReset().mockResolvedValue(domain('one', 'first'));
    createSurveyIndicator.mockReset().mockResolvedValue(indicator('new', 'one'));
    updateSurveyIndicator.mockReset().mockResolvedValue(indicator('one', 'one'));
    createSurveySegment.mockReset().mockResolvedValue(segment('new'));
    updateSurveySegment.mockReset().mockResolvedValue(segment('one'));
    await TestBed.configureTestingModule({
      imports: [SurveyStructureComponent],
      providers: [provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap }, paramMap: of(paramMap) } },
        { provide: AuthService, useValue: { hasPermission: (permission: string) => permission === 'surveys:update' && canUpdate() } },
        { provide: SurveysApiService, useValue: { getSurveyStructure, createSurveySection, updateSurveySection, createSurveyDomain, updateSurveyDomain, createSurveyIndicator, updateSurveyIndicator, createSurveySegment, updateSurveySegment } },
      ],
    }).compileComponents();
  });

  it('loads direct route with read permission, backend order, first selection, and no mutations for reader', async () => {
    expect(routes.find(route => route.path === 'surveys/:surveyId/structure')?.data?.['requiredPermission']).toBe('surveys:read');
    await render();
    expect(getSurveyStructure).toHaveBeenCalledWith(survey.id);
    expect(fixture.nativeElement.textContent).toContain('مجال one');
    expect(fixture.nativeElement.textContent).not.toContain('مجال two');
    expect(fixture.debugElement.queryAll(By.css('tbody tr')).slice(0, 2).map(row => row.nativeElement.textContent)).toEqual([expect.stringContaining('قسم first'), expect.stringContaining('قسم second')]);
    expect(fixture.debugElement.query(By.css('ui-table-actions'))).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('قسم جديد');
    expect(fixture.debugElement.query(By.css('ui-pagination'))).toBeNull();
  });

  it('changes domain panel when reader selects another section', async () => {
    await render();
    fixture.debugElement.queryAll(By.css('.structure-select'))[1].nativeElement.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('مجال two');
    expect(fixture.nativeElement.textContent).not.toContain('مجال one');
    expect(fixture.debugElement.queryAll(By.css('.structure-select'))[1].attributes['aria-pressed']).toBe('true');
  });

  it('shows compact empty states and hides domains until a section exists', async () => {
    getSurveyStructure.mockResolvedValue({ survey, sections: [], rounds: [], segments: [] });
    await render();
    expect(fixture.nativeElement.textContent).toContain('لا توجد أقسام لهذا الاستبيان.');
    expect(fixture.nativeElement.textContent).not.toContain('لا توجد مجالات في هذا القسم.');
    getSurveyStructure.mockResolvedValue({ survey, sections: [section('first')], rounds: [], segments: [] });
    await fixture.componentInstance.retry();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('لا توجد مجالات في هذا القسم.');
  });

  it('shows update controls but hides them for archived surveys', async () => {
    canUpdate.set(true);
    await render();
    expect(fixture.nativeElement.textContent).toContain('قسم جديد');
    expect(fixture.nativeElement.textContent).toContain('مجال جديد');
    expect(fixture.debugElement.queryAll(By.css('ui-table-actions')).length).toBe(3);
    getSurveyStructure.mockResolvedValue({ survey: { ...survey, archivedAt: '2026-01-01' }, sections, rounds: [], segments: [] });
    await fixture.componentInstance.retry();
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('ui-table-actions'))).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('قسم جديد');
  });

  it('creates Section with supported fields and reloads selecting the created Section', async () => {
    canUpdate.set(true);
    await render();
    fixture.componentInstance.openCreateSection();
    fixture.componentInstance.form.patchValue({ code: ' new ', nameAr: ' قسم جديد ', sortOrder: '2', isOptional: true });
    await fixture.componentInstance.save();
    expect(createSurveySection).toHaveBeenCalledWith(survey.id, expect.objectContaining({ code: 'new', nameAr: 'قسم جديد', sortOrder: 2, isOptional: true }));
    expect(Object.keys(createSurveySection.mock.calls[0][1])).not.toContain('academicYearId');
    expect(getSurveyStructure).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.modalOpen()).toBe(false);
  });

  it('preserves Section modal and input on duplicate code error', async () => {
    canUpdate.set(true);
    createSurveySection.mockRejectedValue(new SurveyWriteError('DUPLICATE_SURVEY_SECTION_CODE'));
    await render();
    fixture.componentInstance.openCreateSection();
    fixture.componentInstance.form.patchValue({ code: 'dup', nameAr: 'قيمة محفوظة' });
    await fixture.componentInstance.save();
    expect(fixture.componentInstance.modalOpen()).toBe(true);
    expect(fixture.componentInstance.form.controls.nameAr.value).toBe('قيمة محفوظة');
    expect(fixture.componentInstance.saveError()).toContain('رمز القسم مستخدم');
  });

  it('edits Section without unchanged identity code and retains selected Section', async () => {
    canUpdate.set(true);
    await render();
    fixture.componentInstance.selectSection(sections[1]);
    fixture.componentInstance.openEditSection(sections[1]);
    fixture.componentInstance.form.patchValue({ nameAr: 'قسم معدل' });
    await fixture.componentInstance.save();
    expect(updateSurveySection).toHaveBeenCalledWith(survey.id, 'second', expect.objectContaining({ nameAr: 'قسم معدل' }));
    expect(updateSurveySection.mock.calls[0][2]).not.toHaveProperty('code');
    expect(updateSurveySection.mock.calls[0][2]).not.toHaveProperty('sectionId');
    expect(fixture.componentInstance.selectedSectionId()).toBe('second');
  });

  it('creates Domain under the selected Section and reloads', async () => {
    canUpdate.set(true);
    await render();
    fixture.componentInstance.selectSection(sections[1]);
    fixture.componentInstance.openCreateDomain();
    fixture.componentInstance.form.patchValue({ code: 'NEW_DOMAIN', nameAr: 'مجال جديد' });
    await fixture.componentInstance.save();
    expect(createSurveyDomain).toHaveBeenCalledWith(survey.id, expect.objectContaining({ sectionId: 'second', code: 'NEW_DOMAIN' }));
    expect(getSurveyStructure).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.selectedSectionId()).toBe('second');
  });

  it('prefills Domain edit, omits unchanged identity fields, and shows history-lock errors', async () => {
    canUpdate.set(true);
    updateSurveyDomain.mockRejectedValueOnce(new SurveyWriteError('SURVEY_STRUCTURE_LOCKED'));
    await render();
    fixture.componentInstance.openEditDomain(sections[0].domains[0]);
    expect(fixture.componentInstance.form.controls.sectionId.value).toBe('first');
    expect(fixture.componentInstance.form.controls.code.value).toBe('D_one');
    fixture.componentInstance.form.patchValue({ nameAr: 'مجال معدل' });
    await fixture.componentInstance.save();
    expect(updateSurveyDomain.mock.calls[0][2]).not.toHaveProperty('code');
    expect(updateSurveyDomain.mock.calls[0][2]).not.toHaveProperty('sectionId');
    expect(fixture.componentInstance.saveError()).toContain('بعد تسجيل نتائج');
    expect(fixture.componentInstance.modalOpen()).toBe(true);
    await fixture.componentInstance.save();
    expect(fixture.componentInstance.modalOpen()).toBe(false);
    expect(getSurveyStructure).toHaveBeenCalledTimes(2);
  });

  it('shows friendly Domain duplicate error', async () => {
    canUpdate.set(true);
    createSurveyDomain.mockRejectedValue(new SurveyWriteError('DUPLICATE_SURVEY_DOMAIN_CODE'));
    await render();
    fixture.componentInstance.openCreateDomain();
    fixture.componentInstance.form.patchValue({ code: 'dup', nameAr: 'مجال' });
    await fixture.componentInstance.save();
    expect(fixture.componentInstance.saveError()).toContain('رمز المجال مستخدم');
  });

  it('selects the first Domain by default and follows Section changes', async () => {
    const withIndicators = [section('first', [domain('one', 'first', [indicator('a', 'one')])]), section('second', [domain('two', 'second', [indicator('b', 'two')])])];
    getSurveyStructure.mockResolvedValue({ survey, sections: withIndicators, rounds: [], segments: [] });
    await render();
    expect(fixture.componentInstance.selectedDomainId()).toBe('one');
    expect(fixture.nativeElement.textContent).toContain('مؤشر a');
    fixture.componentInstance.selectSection(withIndicators[1]);
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedDomainId()).toBe('two');
    expect(fixture.nativeElement.textContent).toContain('مؤشر b');
    expect(fixture.nativeElement.textContent).not.toContain('مؤشر a');
  });

  it('selecting a Domain changes Indicators without changing backend order', async () => {
    const withIndicators = [section('first', [
      domain('one', 'first', [indicator('late', 'one'), indicator('early', 'one')]),
      domain('other', 'first', [{ ...indicator('reverse', 'other'), isReverseDirection: true, reportingRuleCode: null }]),
    ])];
    getSurveyStructure.mockResolvedValue({ survey, sections: withIndicators, rounds: [], segments: [] });
    await render();
    expect(fixture.nativeElement.textContent).toContain('مؤشر late');
    expect(fixture.nativeElement.textContent.indexOf('مؤشر late')).toBeLessThan(fixture.nativeElement.textContent.indexOf('مؤشر early'));
    fixture.componentInstance.selectDomain(withIndicators[0].domains[1]);
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedDomainId()).toBe('other');
    expect(fixture.nativeElement.textContent).toContain('مؤشر reverse');
    expect(fixture.nativeElement.textContent).toContain('معكوس الاتجاه');
    expect(fixture.nativeElement.textContent).toContain('بدون قاعدة محددة');
    expect(fixture.nativeElement.textContent).not.toContain('مؤشر late');
    expect(fixture.debugElement.query(By.css('ui-pagination'))).toBeNull();
  });

  it('shows neutral no-Domain and empty-Indicators states without a second CTA', async () => {
    getSurveyStructure.mockResolvedValue({ survey, sections: [section('first')], rounds: [], segments: [] });
    canUpdate.set(true);
    await render();
    expect(fixture.nativeElement.textContent).toContain('لا توجد مجالات لعرض المؤشرات.');
    expect(fixture.nativeElement.textContent).not.toContain('مؤشر جديد');
    getSurveyStructure.mockResolvedValue({ survey, sections: [section('first', [domain('one', 'first')])], rounds: [], segments: [] });
    await fixture.componentInstance.retry();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('لا توجد مؤشرات في هذا المجال.');
    expect(fixture.debugElement.queryAll(By.css('button')).filter(button => button.nativeElement.textContent.includes('مؤشر جديد')).length).toBe(1);
  });

  it('shows Indicator mutations only with update permission and an unarchived Survey', async () => {
    const withIndicator = [section('first', [domain('one', 'first', [indicator('a', 'one')])])];
    getSurveyStructure.mockResolvedValue({ survey, sections: withIndicator, rounds: [], segments: [] });
    await render();
    expect(fixture.nativeElement.textContent).not.toContain('مؤشر جديد');
    expect(fixture.debugElement.query(By.css('button[aria-label="تعديل المؤشر مؤشر a"]'))).toBeNull();
    canUpdate.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('مؤشر جديد');
    expect(fixture.debugElement.query(By.css('button[aria-label="تعديل المؤشر مؤشر a"]'))).not.toBeNull();
    getSurveyStructure.mockResolvedValue({ survey: { ...survey, archivedAt: '2026-01-01' }, sections: withIndicator, rounds: [], segments: [] });
    await fixture.componentInstance.retry();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('مؤشر a');
    expect(fixture.nativeElement.textContent).not.toContain('مؤشر جديد');
    expect(fixture.debugElement.query(By.css('button[aria-label="تعديل المؤشر مؤشر a"]'))).toBeNull();
  });

  it('uses all backend reporting rules plus nullable option with Arabic labels', async () => {
    canUpdate.set(true);
    await render();
    fixture.componentInstance.openCreateIndicator();
    fixture.detectChanges();
    const select = fixture.debugElement.query(By.css('#indicator-rule select')).nativeElement as HTMLSelectElement;
    expect(Array.from(select.options, option => option.value)).toEqual(['', ...SURVEY_INDICATOR_REPORTING_RULES]);
    expect(Array.from(select.options, option => option.textContent?.trim())).toEqual([
      'بدون قاعدة محددة', 'أعلى درجتي اتفاق', 'أعلى درجتي تكرار', 'أعلى ثلاث درجات تكرار', 'نسبة مباشرة',
    ]);
    expect(fixture.componentInstance.indicatorForm.controls.reportingRuleCode.value).toBe('');
  });

  it('creates Indicator under selected Domain, sends supported metadata, and retains selections after reload', async () => {
    canUpdate.set(true);
    const withDomains = [section('first', [domain('one', 'first'), domain('other', 'first')])];
    getSurveyStructure.mockResolvedValue({ survey, sections: withDomains, rounds: [], segments: [] });
    await render();
    fixture.componentInstance.selectDomain(withDomains[0].domains[1]);
    fixture.componentInstance.openCreateIndicator();
    fixture.componentInstance.indicatorForm.patchValue({ code: ' raw ', textAr: ' نص المؤشر ', reportingRuleCode: 'FREQUENCY_TOP_3', isReverseDirection: true, sortOrder: '4' });
    await fixture.componentInstance.saveIndicator();
    expect(createSurveyIndicator).toHaveBeenCalledWith(survey.id, expect.objectContaining({ domainId: 'other', code: 'raw', textAr: 'نص المؤشر', reportingRuleCode: 'FREQUENCY_TOP_3', isReverseDirection: true, sortOrder: 4 }));
    expect(createSurveyIndicator.mock.calls[0][1]).not.toHaveProperty('academicYearId');
    expect(createSurveyIndicator.mock.calls[0][1]).not.toHaveProperty('surveyId');
    expect(getSurveyStructure).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.selectedSectionId()).toBe('first');
    expect(fixture.componentInstance.selectedDomainId()).toBe('other');
    expect(fixture.componentInstance.indicatorModalOpen()).toBe(false);
  });

  it('retains Section and Domain selection after existing Section mutation', async () => {
    canUpdate.set(true);
    const withDomains = [section('first', [domain('one', 'first'), domain('other', 'first')])];
    getSurveyStructure.mockResolvedValue({ survey, sections: withDomains, rounds: [], segments: [] });
    await render();
    fixture.componentInstance.selectDomain(withDomains[0].domains[1]);
    fixture.componentInstance.openEditSection(withDomains[0]);
    fixture.componentInstance.form.patchValue({ nameAr: 'اسم معدل' });
    await fixture.componentInstance.save();
    expect(fixture.componentInstance.selectedSectionId()).toBe('first');
    expect(fixture.componentInstance.selectedDomainId()).toBe('other');
  });

  it('preserves Indicator modal and input on duplicate-code failure', async () => {
    canUpdate.set(true);
    createSurveyIndicator.mockRejectedValue(new SurveyWriteError('DUPLICATE_SURVEY_INDICATOR_CODE'));
    await render();
    fixture.componentInstance.openCreateIndicator();
    fixture.componentInstance.indicatorForm.patchValue({ code: 'duplicate', textAr: 'نص محفوظ' });
    await fixture.componentInstance.saveIndicator();
    expect(fixture.componentInstance.indicatorModalOpen()).toBe(true);
    expect(fixture.componentInstance.indicatorForm.controls.textAr.value).toBe('نص محفوظ');
    expect(fixture.componentInstance.indicatorSaveError()).toContain('رمز المؤشر مستخدم');
  });

  it('prefills Indicator edit and omits unchanged locked fields from update payload', async () => {
    canUpdate.set(true);
    const item = { ...indicator('a', 'one'), textHe: 'טקסט', reportingRuleCode: 'AGREEMENT_TOP_2' as const, isReverseDirection: true };
    getSurveyStructure.mockResolvedValue({ survey, sections: [section('first', [domain('one', 'first', [item])])], rounds: [], segments: [] });
    await render();
    fixture.componentInstance.openEditIndicator(item);
    expect(fixture.componentInstance.indicatorForm.controls.code.value).toBe('I_a');
    expect(fixture.componentInstance.indicatorForm.controls.textAr.value).toBe('مؤشر a');
    expect(fixture.componentInstance.indicatorForm.controls.textHe.value).toBe('טקסט');
    expect(fixture.componentInstance.indicatorForm.controls.reportingRuleCode.value).toBe('AGREEMENT_TOP_2');
    expect(fixture.componentInstance.indicatorForm.controls.isReverseDirection.value).toBe(true);
    fixture.componentInstance.indicatorForm.patchValue({ descriptionAr: 'وصف معدل', sortOrder: '5', isActive: false });
    await fixture.componentInstance.saveIndicator();
    const payload = updateSurveyIndicator.mock.calls[0][2];
    expect(payload).toEqual(expect.objectContaining({ descriptionAr: 'وصف معدل', sortOrder: 5, isActive: false }));
    for (const field of ['domainId', 'code', 'textAr', 'textHe', 'reportingRuleCode', 'isReverseDirection', 'academicYearId', 'surveyId']) expect(payload).not.toHaveProperty(field);
    expect(getSurveyStructure).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.selectedDomainId()).toBe('one');
  });

  it('shows history-lock error for changed meaning field while preserving edit modal', async () => {
    canUpdate.set(true);
    const item = indicator('a', 'one');
    getSurveyStructure.mockResolvedValue({ survey, sections: [section('first', [domain('one', 'first', [item])])], rounds: [], segments: [] });
    updateSurveyIndicator.mockRejectedValue(new SurveyWriteError('SURVEY_STRUCTURE_LOCKED'));
    await render();
    fixture.componentInstance.openEditIndicator(item);
    fixture.componentInstance.indicatorForm.patchValue({ reportingRuleCode: 'FREQUENCY_TOP_2', isReverseDirection: true });
    await fixture.componentInstance.saveIndicator();
    expect(updateSurveyIndicator.mock.calls[0][2]).toEqual(expect.objectContaining({ reportingRuleCode: 'FREQUENCY_TOP_2', isReverseDirection: true }));
    expect(fixture.componentInstance.indicatorSaveError()).toContain('بعد تسجيل نتائج');
    expect(fixture.componentInstance.indicatorModalOpen()).toBe(true);
  });

  it('renders survey-level Segments in backend order even when no Section exists', async () => {
    getSurveyStructure.mockResolvedValue({ survey, sections: [], rounds: [], segments: [segment('later'), segment('earlier')] });
    await render();
    const panel = fixture.debugElement.query(By.css('section[aria-label="شرائح الاستبيان"]'));
    expect(panel).not.toBeNull();
    expect(panel.queryAll(By.css('tbody tr')).map(row => row.nativeElement.textContent)).toEqual([
      expect.stringContaining('شريحة later'), expect.stringContaining('شريحة earlier'),
    ]);
    expect(fixture.nativeElement.textContent).toContain('لا توجد أقسام لهذا الاستبيان.');
    expect(panel.query(By.css('ui-table-actions'))).toBeNull();
    expect(fixture.debugElement.query(By.css('ui-pagination'))).toBeNull();
  });

  it('shows Segment empty state and gates mutations by permission and archive state', async () => {
    await render();
    expect(fixture.nativeElement.textContent).toContain('لا توجد شرائح لهذا الاستبيان.');
    expect(fixture.nativeElement.textContent).not.toContain('شريحة جديدة');
    canUpdate.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('شريحة جديدة');
    getSurveyStructure.mockResolvedValue({ survey: { ...survey, archivedAt: '2026-01-01' }, sections, rounds: [], segments: [segment('one')] });
    await fixture.componentInstance.retry();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('شريحة one');
    expect(fixture.nativeElement.textContent).not.toContain('شريحة جديدة');
    expect(fixture.debugElement.query(By.css('button[aria-label="تعديل الشريحة شريحة one"]'))).toBeNull();
  });

  it('creates Segment with free text type and retains Section and Domain selection', async () => {
    canUpdate.set(true);
    await render();
    fixture.componentInstance.selectSection(sections[1]);
    fixture.componentInstance.openCreateSegment();
    fixture.detectChanges();
    expect(fixture.componentInstance.segmentModalOpen()).toBe(true);
    expect(fixture.debugElement.query(By.css('#segment-form'))).not.toBeNull();
    fixture.componentInstance.segmentForm.patchValue({ code: ' raw ', nameAr: ' شريحة جديدة ', nameHe: ' שם ', segmentType: ' school_area ', sortOrder: '3', isActive: false });
    await fixture.componentInstance.saveSegment();
    expect(createSurveySegment).toHaveBeenCalledWith(survey.id, { code: 'raw', nameAr: 'شريحة جديدة', nameHe: 'שם', segmentType: 'school_area', sortOrder: 3, isActive: false });
    expect(createSurveySegment.mock.calls[0][1]).not.toHaveProperty('academicYearId');
    expect(createSurveySegment.mock.calls[0][1]).not.toHaveProperty('sectionId');
    expect(getSurveyStructure).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.selectedSectionId()).toBe('second');
    expect(fixture.componentInstance.selectedDomainId()).toBe('two');
    expect(fixture.componentInstance.segmentModalOpen()).toBe(false);
  });

  it('edits Segment metadata without unchanged identity code and retains selections', async () => {
    canUpdate.set(true);
    const item = { ...segment('one'), nameHe: 'שם', segmentType: 'custom', isActive: false };
    getSurveyStructure.mockResolvedValue({ survey, sections, rounds: [], segments: [item] });
    await render();
    fixture.componentInstance.selectSection(sections[1]);
    fixture.componentInstance.openEditSegment(item);
    expect(fixture.componentInstance.segmentForm.getRawValue()).toEqual({ code: 'G_one', nameAr: 'شريحة one', nameHe: 'שם', segmentType: 'custom', sortOrder: '0', isActive: false });
    fixture.componentInstance.segmentForm.patchValue({ nameAr: 'اسم معدل', segmentType: '', isActive: true });
    await fixture.componentInstance.saveSegment();
    expect(updateSurveySegment).toHaveBeenCalledWith(survey.id, 'one', expect.objectContaining({ nameAr: 'اسم معدل', segmentType: null, isActive: true }));
    expect(updateSurveySegment.mock.calls[0][2]).not.toHaveProperty('code');
    expect(getSurveyStructure).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.selectedSectionId()).toBe('second');
    expect(fixture.componentInstance.selectedDomainId()).toBe('two');
  });

  it('keeps Segment modal open with friendly duplicate and history-lock errors', async () => {
    canUpdate.set(true);
    createSurveySegment.mockRejectedValueOnce(new SurveyWriteError('DUPLICATE_SURVEY_SEGMENT_CODE'));
    updateSurveySegment.mockRejectedValueOnce(new SurveyWriteError('SURVEY_STRUCTURE_LOCKED'));
    await render();
    fixture.componentInstance.openCreateSegment();
    fixture.componentInstance.segmentForm.patchValue({ code: 'dup', nameAr: 'اسم محفوظ' });
    await fixture.componentInstance.saveSegment();
    expect(fixture.componentInstance.segmentModalOpen()).toBe(true);
    expect(fixture.componentInstance.segmentForm.controls.nameAr.value).toBe('اسم محفوظ');
    expect(fixture.componentInstance.segmentSaveError()).toContain('رمز الشريحة مستخدم');
    fixture.componentInstance.closeSegmentModal();
    fixture.componentInstance.openEditSegment(segment('one'));
    fixture.componentInstance.segmentForm.patchValue({ code: 'changed' });
    await fixture.componentInstance.saveSegment();
    expect(updateSurveySegment.mock.calls[0][2].code).toBe('changed');
    expect(fixture.componentInstance.segmentSaveError()).toContain('بعد تسجيل نتائج');
    expect(fixture.componentInstance.segmentModalOpen()).toBe(true);
  });
});
