import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../../app.routes';
import { AuthService } from '../../../core/services/auth.service';
import { SurveyWriteError, SurveysApiService } from '../../../core/services/surveys-api.service';
import type { SurveyDetail, SurveyDomain, SurveySection, SurveyStructureResponse } from '../models/survey.model';
import { SurveyStructureComponent } from './survey-structure.component';

const survey: SurveyDetail = { id: 'survey-1', academicYearId: 'year-1', nameAr: 'استبيان', nameHe: null, descriptionAr: null, descriptionHe: null, audienceType: null, status: 'ACTIVE', isActive: true, archivedAt: null, createdAt: '', updatedAt: '' };
const domain = (id: string, sectionId: string): SurveyDomain => ({ id, surveyId: survey.id, sectionId, code: `D_${id}`, nameAr: `مجال ${id}`, nameHe: null, descriptionAr: null, descriptionHe: null, sortOrder: 0, isActive: true });
const section = (id: string, domains: SurveyDomain[] = []): SurveySection => ({ id, surveyId: survey.id, code: `S_${id}`, nameAr: `قسم ${id}`, nameHe: null, descriptionAr: null, descriptionHe: null, sortOrder: 0, isOptional: false, isActive: true, domains });
const sections = [section('first', [domain('one', 'first')]), section('second', [domain('two', 'second')])];

describe('SurveyStructureComponent', () => {
  let fixture: ComponentFixture<SurveyStructureComponent>;
  const canUpdate = signal(false);
  const getSurveyStructure = vi.fn<(id: string) => Promise<SurveyStructureResponse>>();
  const createSurveySection = vi.fn();
  const updateSurveySection = vi.fn();
  const createSurveyDomain = vi.fn();
  const updateSurveyDomain = vi.fn();
  const paramMap = convertToParamMap({ surveyId: survey.id });
  const render = async () => {
    fixture = TestBed.createComponent(SurveyStructureComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    canUpdate.set(false);
    getSurveyStructure.mockReset().mockResolvedValue({ survey, sections, rounds: [] });
    createSurveySection.mockReset().mockResolvedValue(section('new'));
    updateSurveySection.mockReset().mockResolvedValue(section('first'));
    createSurveyDomain.mockReset().mockResolvedValue(domain('new', 'first'));
    updateSurveyDomain.mockReset().mockResolvedValue(domain('one', 'first'));
    await TestBed.configureTestingModule({
      imports: [SurveyStructureComponent],
      providers: [provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap }, paramMap: of(paramMap) } },
        { provide: AuthService, useValue: { hasPermission: (permission: string) => permission === 'surveys:update' && canUpdate() } },
        { provide: SurveysApiService, useValue: { getSurveyStructure, createSurveySection, updateSurveySection, createSurveyDomain, updateSurveyDomain } },
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
    getSurveyStructure.mockResolvedValue({ survey, sections: [], rounds: [] });
    await render();
    expect(fixture.nativeElement.textContent).toContain('لا توجد أقسام لهذا الاستبيان.');
    expect(fixture.nativeElement.textContent).not.toContain('لا توجد مجالات في هذا القسم.');
    getSurveyStructure.mockResolvedValue({ survey, sections: [section('first')], rounds: [] });
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
    getSurveyStructure.mockResolvedValue({ survey: { ...survey, archivedAt: '2026-01-01' }, sections, rounds: [] });
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
});
