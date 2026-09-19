import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { SubjectsComponent } from './subjects.component';

describe('SubjectsComponent registry', () => {
  let fixture: ComponentFixture<SubjectsComponent>;
  let component: SubjectsComponent;

  const subjects = signal([
    { id: 'math', institutionId: 'inst', academicYearId: 'year-1', nameAr: 'الرياضيات', nameHe: 'מתמטיקה', isActive: true, archivedAt: null },
    { id: 'science', institutionId: 'inst', academicYearId: 'year-1', nameAr: 'العلوم', nameHe: 'מדעים', isActive: false, archivedAt: null },
  ]);
  const topics = signal([
    { id: 'topic-1', institutionId: 'inst', academicYearId: 'year-1', subjectId: 'math', gradeLevelId: 'grade-1', nameAr: 'الكسور', isActive: true },
  ]);
  const skills = signal([
    { id: 'skill-1', institutionId: 'inst', academicYearId: 'year-1', subjectId: 'math', gradeLevelId: 'grade-1', nameAr: 'حل المسائل', isActive: true },
  ]);
  const api = {
    subjects,
    topics,
    skills,
    academicYears: signal([{ id: 'year-1', yearLabel: '2026', isCurrent: true }]),
    selectedAcademicYearId: signal('year-1'),
    lookups: signal({ gradeLevels: [{ id: 'grade-1', nameAr: 'الطبقة الخامسة', codeNumber: 5, sortOrder: 5 }] }),
    subjectsApi: { error: signal('') },
    settingsApi: { loadLookups: vi.fn().mockResolvedValue(undefined) },
    loadSubjects: vi.fn().mockResolvedValue(undefined),
    loadTopics: vi.fn().mockResolvedValue(undefined),
    loadSkills: vi.fn().mockResolvedValue(undefined),
    loadAcademicYears: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubjectsComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { hasPermission: () => true } },
        { provide: ConfirmDialogService, useValue: { confirm: vi.fn().mockResolvedValue(false) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(SubjectsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('renders a natural responsive card grid without internal-scroll classes', () => {
    const grid = fixture.debugElement.query(By.css('.subject-registry__grid'));
    expect(grid).toBeTruthy();
    expect(grid.nativeElement.className).not.toMatch(/overflow-y|max-h/);
    expect(fixture.debugElement.queryAll(By.css('.subject-card'))).toHaveLength(2);
  });

  it('marks the selected subject and selects another card with a click', () => {
    const cards = fixture.debugElement.queryAll(By.css('.subject-card'));
    expect(cards[0].nativeElement.getAttribute('aria-current')).toBe('true');
    cards[1].nativeElement.click();
    fixture.detectChanges();
    expect(component.selectedSubjectId()).toBe('science');
    expect(cards[1].nativeElement.classList.contains('subject-card--selected')).toBe(true);
  });

  it('does not change selection when an action inside another card is clicked', () => {
    const cards = fixture.debugElement.queryAll(By.css('.subject-card'));
    const editButton = cards[1].query(By.css('ui-table-actions button'));
    editButton.nativeElement.click();
    fixture.detectChanges();
    expect(component.selectedSubject()?.id).toBe('math');
    expect(component.isEditingSubject()).toBe(true);
  });

  it('filters by Arabic and Hebrew subject names and shows the empty state', () => {
    const search = fixture.debugElement.query(By.css('#subject-registry-search')).nativeElement as HTMLInputElement;
    search.value = 'رياض';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.debugElement.queryAll(By.css('.subject-card'))).toHaveLength(1);

    search.value = 'מדעים';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('العلوم');

    search.value = 'لغة';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('لا توجد مواد تطابق البحث');
  });

  it('uses shared badges/actions, preserves counts, and adds no pagination controls', () => {
    const firstCard = fixture.debugElement.query(By.css('.subject-card'));
    expect(firstCard.queryAll(By.css('ui-badge')).length).toBeGreaterThanOrEqual(3);
    expect(firstCard.query(By.css('ui-table-actions'))).toBeTruthy();
    expect(firstCard.nativeElement.textContent).toContain('1 موضوع');
    expect(firstCard.nativeElement.textContent).toContain('1 مهارة ومخرج');
    expect(fixture.nativeElement.textContent).not.toMatch(/تحميل المزيد|التالي|السابق/);
  });
});
