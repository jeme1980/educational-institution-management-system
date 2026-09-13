import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { LookupTablesComponent } from './lookup-tables.component';

describe('LookupTablesComponent exam lookup management', () => {
  const examType = { id: 'exam-type-1', nameAr: 'فصلي', nameHe: null, sortOrder: 1, isActive: true };
  const questionType = { id: 'question-type-1', nameAr: 'اختيار من متعدد', nameHe: null, sortOrder: 2, isActive: true };
  let api: any;

  beforeEach(() => {
    api = {
      publicLookups: signal({ specializations: [], examTypes: [examType], questionTypes: [questionType] }),
      examTypes: signal([]), questionTypes: signal([]),
      jobRoles: signal([]), institutions: signal([]), selectedInstitutionId: signal(null),
      lookupMutationError: signal(''), usersApi: { jobRoleError: signal('') },
      loadInstitutions: vi.fn(), loadPublicLookups: vi.fn(), loadQuestionTypes: vi.fn(), loadExamTypes: vi.fn(), loadJobRoles: vi.fn(),
      createPublicLookup: vi.fn().mockResolvedValue(true), updatePublicLookup: vi.fn().mockResolvedValue(true), deletePublicLookup: vi.fn().mockResolvedValue(true),
      createJobRole: vi.fn(), updateJobRole: vi.fn(), deleteJobRole: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [LookupTablesComponent],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { currentContext: signal({ permissions: ['settings:read', 'settings:update'] }), hasPermission: (permission: string) => permission === 'settings:update' } },
        { provide: ConfirmDialogService, useValue: { confirm: vi.fn().mockResolvedValue(true) } },
      ],
    });
  });

  it('renders the two lookup categories and their current values', () => {
    const fixture = TestBed.createComponent(LookupTablesComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.definitions.map((item) => item.key)).toEqual(expect.arrayContaining(['examTypes', 'questionTypes']));
    component.selectTable('examTypes');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('أنواع الامتحانات');
    expect(fixture.nativeElement.textContent).toContain('فصلي');
    expect(fixture.nativeElement.querySelector('ui-badge')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('ui-table-actions')).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain('تحميل المزيد');
    component.selectTable('questionTypes');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('أنواع الأسئلة');
    expect(fixture.nativeElement.textContent).toContain('اختيار من متعدد');
  });

  it('creates an exam type through the generic lookup API and refreshes the exam form lookup', async () => {
    const fixture = TestBed.createComponent(LookupTablesComponent);
    const component = fixture.componentInstance;
    component.selectTable('examTypes');
    component.openAddModal();
    component.form.patchValue({ nameAr: 'شفهي', sortOrder: 3, isActive: true });
    await component.saveItem();
    expect(api.createPublicLookup).toHaveBeenCalledWith('examTypes', expect.objectContaining({ nameAr: 'شفهي', sortOrder: 3, isActive: true }));
    expect(api.examTypes()).toEqual([examType]);
  });

  it('updates question types and refreshes the question form lookup', async () => {
    const fixture = TestBed.createComponent(LookupTablesComponent);
    const component = fixture.componentInstance;
    component.selectTable('questionTypes');
    component.openEditModal(questionType);
    component.form.patchValue({ nameAr: 'سؤال مقالي' });
    await component.saveItem();
    expect(api.updatePublicLookup).toHaveBeenCalledWith('questionTypes', questionType.id, expect.objectContaining({ nameAr: 'سؤال مقالي' }));
    expect(api.questionTypes()).toEqual([questionType]);
  });

  it('deletes an unused type after shared confirmation', async () => {
    const fixture = TestBed.createComponent(LookupTablesComponent);
    const component = fixture.componentInstance;
    component.selectTable('examTypes');
    await component.deleteItem(examType);
    expect(TestBed.inject(ConfirmDialogService).confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'حذف نوع امتحان؟', variant: 'danger' }));
    expect(api.deletePublicLookup).toHaveBeenCalledWith('examTypes', examType.id);
    expect(component.toast()?.message).toBe('تم حذف السجل بنجاح');
  });

  it('shows the readable API error when a used type cannot be deleted', async () => {
    const fixture = TestBed.createComponent(LookupTablesComponent);
    const component = fixture.componentInstance;
    api.deletePublicLookup.mockResolvedValueOnce(false);
    api.lookupMutationError.set('لا يمكن حذف نوع السؤال لأنه مستخدم في أسئلة موجودة.');
    component.selectTable('questionTypes');
    await component.deleteItem(questionType);
    expect(component.toast()?.message).toBe('لا يمكن حذف نوع السؤال لأنه مستخدم في أسئلة موجودة.');
    expect(component.toast()?.type).toBe('error');
  });
});
