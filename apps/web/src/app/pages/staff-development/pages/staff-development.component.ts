import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../core/services/api.service';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { StaffDevelopment } from '../../../core/models/api.models';
import { UiInputComponent } from '../../../shared/components/input/ui-input.component';
import { UiSelectComponent } from '../../../shared/components/select/ui-select.component';
import { UiModalComponent } from '../../../shared/components/ui-modal/ui-modal.component';
import { AuthService } from '../../../core/services/auth.service';
import { UiButtonComponent } from '../../../shared/components/ui-button/ui-button.component';
import { UiPageHeaderComponent } from '../../../shared/components/ui-page-header/ui-page-header.component';
import { UiStatCardComponent } from '../../../shared/components/ui-stat-card/ui-stat-card.component';
import { UiFilterPanelComponent } from '../../../shared/components/ui-filter-panel/ui-filter-panel.component';
import { UiTableActionsComponent } from '../../../shared/components/ui-table-actions/ui-table-actions.component';

export type CompletionPeriodMode = 'ALL' | 'YEAR' | 'CUSTOM';

export function dateValueToUtcDay(value: string | null | undefined): number | null {
  const raw = String(value || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(raw);
  if (!match) return null;
  if (raw.length > 10 && Number.isNaN(Date.parse(raw))) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcDay = Date.UTC(year, month - 1, day);
  const normalized = new Date(utcDay);
  return normalized.getUTCFullYear() === year && normalized.getUTCMonth() === month - 1 && normalized.getUTCDate() === day
    ? utcDay
    : null;
}

@Component({
  selector: 'app-staff-development',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, UiInputComponent, UiSelectComponent, UiModalComponent, UiButtonComponent, UiPageHeaderComponent, UiStatCardComponent, UiFilterPanelComponent, UiTableActionsComponent],
  templateUrl: './staff-development.component.html',
  styleUrl: './staff-development.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffDevelopmentComponent implements OnInit {
  readonly apiService = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly authService = inject(AuthService);
  readonly canCreate = computed(() => this.authService.hasPermission('teachers:create'));
  readonly canUpdate = computed(() => this.authService.hasPermission('teachers:update'));
  readonly canDelete = computed(() => this.authService.hasPermission('teachers:delete'));

  readonly searchTerm = signal('');
  readonly showModal = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly isSaving = signal(false);
  readonly selectedStaffId = signal('ALL');
  readonly selectedSpecializationId = signal('ALL');
  readonly periodMode = signal<CompletionPeriodMode>('ALL');
  readonly selectedYear = signal<number | null>(null);
  readonly fromDate = signal('');
  readonly toDate = signal('');
  readonly specializations = computed(() =>
    (this.apiService.publicLookups()['specializations'] || []).filter(item => item.isActive !== false),
  );
  readonly availableYears = computed(() => {
    const years = new Set<number>();
    for (const item of this.apiService.staffDevelopments()) {
      const startDay = dateValueToUtcDay(item.startDate);
      const endDay = dateValueToUtcDay(item.endDate);
      if (startDay === null || endDay === null) continue;
      const startYear = new Date(Math.min(startDay, endDay)).getUTCFullYear();
      const endYear = new Date(Math.max(startDay, endDay)).getUTCFullYear();
      for (let year = startYear; year <= endYear; year++) years.add(year);
    }
    return [...years].sort((a, b) => b - a);
  });
  readonly dateRangeError = computed(() => {
    const fromDay = dateValueToUtcDay(this.fromDate());
    const toDay = dateValueToUtcDay(this.toDate());
    return fromDay !== null && toDay !== null && fromDay > toDay
      ? 'يجب أن يكون تاريخ البداية قبل تاريخ النهاية.'
      : '';
  });
  readonly beneficiaryCount = computed(() => new Set(this.apiService.staffDevelopments().map(item => item.staffMemberId)).size);
  readonly totalHours = computed(() => this.apiService.staffDevelopments().reduce((total, item) => total + (item.hoursCount || 0), 0));

  readonly form = this.fb.nonNullable.group({
    staffMemberId: ['', Validators.required],
    courseCode: ['', [Validators.required, Validators.maxLength(20)]],
    courseName: ['', [Validators.required, Validators.maxLength(200)]],
    providerId: [''],
    hoursCount: [null as number | null, [Validators.min(0)]],
    startDate: ['', Validators.required],
    endDate: ['', Validators.required],
  });

  readonly filteredDevelopments = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const staffId = this.selectedStaffId();
    const specializationId = this.selectedSpecializationId();
    return this.apiService.staffDevelopments().filter(item => {
      const staffName = `${item.staffMember?.firstNameAr || ''} ${item.staffMember?.familyNameAr || ''}`.toLowerCase();
      const matchesTerm = !term || [item.courseCode, item.courseName, item.provider?.name || '', staffName].some(value => value.toLowerCase().includes(term));
      const matchesStaff = staffId === 'ALL' || item.staffMemberId === staffId;
      const matchesSpecialization = specializationId === 'ALL' || item.staffMember?.specialization?.id === specializationId;
      const matchesPeriod = this.matchesPeriodFilter(item.startDate, item.endDate);
      return matchesTerm && matchesStaff && matchesSpecialization && matchesPeriod;
    });
  });

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.apiService.loadStaff(),
      this.apiService.loadStaffDevelopments(),
      this.apiService.loadInstitutions(),
      this.apiService.loadPublicLookups(),
    ]);
  }

  readonly importMessage = signal('');
  readonly importError = signal('');

  async downloadImportTemplate(): Promise<void> {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('الاستكمالات', {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
    });
    sheet.columns = [
      { header: 'schoolCode', key: 'schoolCode', width: 18 },
      { header: 'nationalId', key: 'nationalId', width: 22 },
      { header: 'courseCode', key: 'courseCode', width: 18 },
      { header: 'courseName', key: 'courseName', width: 38 },
      { header: 'providerCode', key: 'providerCode', width: 24 },
      { header: 'hoursCount', key: 'hoursCount', width: 14 },
      { header: 'startDate', key: 'startDate', width: 16 },
      { header: 'endDate', key: 'endDate', width: 16 },
    ];
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123A82' } };
    header.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.autoFilter = 'A1:H1';
    sheet.getCell('A1').note = 'schoolCode يحدد المؤسسة التعليمية.';
    sheet.getCell('B1').note = 'nationalId هو رقم هوية الموظف.';
    sheet.getCell('E1').note = 'اختر providerCode من القائمة.';
    sheet.getColumn('G').numFmt = 'yyyy-mm-dd';
    sheet.getColumn('H').numFmt = 'yyyy-mm-dd';

    const providerSheet = workbook.addWorksheet('قائمة الجهات');
    providerSheet.state = 'hidden';
    providerSheet.getCell('A1').value = 'providerCode';
    providerSheet.getCell('B1').value = 'name';
    const providers = this.apiService.publicLookups()['providers'] || [];
    providers.forEach((provider: any, index: number) => {
      providerSheet.getCell(`A${index + 2}`).value = provider.providerCode;
      providerSheet.getCell(`B${index + 2}`).value = provider.name || provider.nameAr || provider.providerCode;
    });
    if (providers.length) {
      (sheet as any).dataValidations.add('E2:E500', {
        type: 'list',
        allowBlank: true,
        formulae: [`'قائمة الجهات'!$A$2:$A$${providers.length + 1}`],
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'قالب-استيراد-الاستكمالات.xlsx';
    link.click();
    URL.revokeObjectURL(url);
  }

  async importDevelopments(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.importMessage.set('');
    this.importError.set('');
    try {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new Error('لم يتم العثور على ورقة بيانات.');
      const rows: any[][] = [];
      sheet.eachRow((row) => rows.push((row.values as any[]).slice(1)));
      if (rows.length < 2) throw new Error('ملف الاستيراد لا يحتوي على سجلات.');
      const headers = rows[0].map(value => this.normalizeHeader(value));
      const aliases: Record<string, string[]> = {
        schoolCode: ['schoolcode', 'institutionid', 'institutioncode'],
        nationalId: ['nationalid', 'staffmember', 'staffmembernationalid'],
        courseCode: ['coursecode'], courseName: ['coursename'], providerCode: ['providercode', 'providerid'],
        hoursCount: ['hourscount', 'hours'], startDate: ['startdate'], endDate: ['enddate'],
      };
      const indexOf = (key: string) => headers.findIndex(header => aliases[key].includes(header));
      const index: Record<string, number> = Object.fromEntries(Object.keys(aliases).map(key => [key, indexOf(key)]));
      const missing = ['schoolCode', 'nationalId', 'courseCode', 'courseName', 'startDate', 'endDate'].filter(key => index[key] < 0);
      if (missing.length) throw new Error(`الأعمدة المطلوبة غير موجودة: ${missing.join(', ')}`);

      const institutions = this.apiService.institutions() as any[];
      const staff = this.apiService.staff();
      const providers = this.apiService.publicLookups()['providers'] || [];
      const errors: string[] = [];
      let imported = 0;
      for (let rowNumber = 1; rowNumber < rows.length; rowNumber++) {
        const row = rows[rowNumber];
        if (row.every(value => String(value ?? '').trim() === '')) continue;
        const schoolCode = this.cellText(row[index['schoolCode']]);
        const nationalId = this.cellText(row[index['nationalId']]);
        const institution = institutions.find(item => String(item.schoolCode ?? '').trim().toLowerCase() === schoolCode.toLowerCase());
        const member = staff.find(item => String(item.nationalId ?? '').trim() === nationalId && (!institution || item.institutionId === institution.id));
        if (!institution) { errors.push(`الصف ${rowNumber + 1}: schoolCode غير موجود (${schoolCode}).`); continue; }
        if (this.apiService.selectedInstitutionId() && institution.id !== this.apiService.selectedInstitutionId()) { errors.push(`الصف ${rowNumber + 1}: المؤسسة لا تطابق المؤسسة النشطة.`); continue; }
        if (!member) { errors.push(`الصف ${rowNumber + 1}: الموظف برقم الهوية ${nationalId} غير موجود.`); continue; }
        const providerValue = this.cellText(row[index['providerCode']]);
        const provider = providers.find((item: any) => item.providerCode === providerValue || item.id === providerValue || item.name === providerValue || item.nameAr === providerValue);
        const hoursValue = index['hoursCount'] >= 0 ? this.cellText(row[index['hoursCount']]) : '';
        const hoursCount = hoursValue === '' ? null : Number(hoursValue);
        if (hoursCount !== null && (!Number.isInteger(hoursCount) || hoursCount < 0)) { errors.push(`الصف ${rowNumber + 1}: hoursCount يجب أن يكون رقمًا صحيحًا موجبًا أو صفرًا.`); continue; }
        const payload = {
          staffMemberId: member.id, courseCode: this.cellText(row[index['courseCode']]), courseName: this.cellText(row[index['courseName']]),
          providerId: provider?.id || null, hoursCount, startDate: this.excelDate(row[index['startDate']]), endDate: this.excelDate(row[index['endDate']]),
        };
        if (!payload.courseCode || !payload.courseName || !payload.startDate || !payload.endDate) { errors.push(`الصف ${rowNumber + 1}: توجد بيانات أساسية ناقصة.`); continue; }
        if (await this.apiService.createStaffDevelopment(payload)) imported++;
        else errors.push(`الصف ${rowNumber + 1}: ${this.apiService.usersApi.staffDevelopmentError() || 'تعذر حفظ السجل.'}`);
      }
      if (imported) await this.apiService.loadStaffDevelopments();
      if (imported) this.importMessage.set(`تم استيراد ${imported} سجل بنجاح.`);
      if (errors.length) this.importError.set(errors.slice(0, 10).join(' '));
    } catch (error) {
      this.importError.set(error instanceof Error ? error.message : 'تعذر قراءة ملف Excel.');
    } finally {
      input.value = '';
    }
  }

  private normalizeHeader(value: unknown): string { return this.cellText(value).replace(/^\uFEFF/, '').toLowerCase().replace(/[\s_-]/g, ''); }
  private cellText(value: unknown): string { return value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '').trim(); }
  private excelDate(value: unknown): string {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const text = this.cellText(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }

  updateSearch(event: Event): void { this.searchTerm.set((event.target as HTMLInputElement).value); }
  updateStaffFilter(event: Event): void { this.selectedStaffId.set((event.target as HTMLSelectElement).value); }
  updateSpecializationFilter(event: Event): void { this.selectedSpecializationId.set((event.target as HTMLSelectElement).value); }
  updatePeriodMode(event: Event): void {
    this.periodMode.set((event.target as HTMLSelectElement).value as CompletionPeriodMode);
    this.selectedYear.set(null);
    this.fromDate.set('');
    this.toDate.set('');
  }
  updateYearFilter(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedYear.set(value ? Number(value) : null);
  }
  updateFromDate(event: Event): void { this.fromDate.set((event.target as HTMLInputElement).value); }
  updateToDate(event: Event): void { this.toDate.set((event.target as HTMLInputElement).value); }

  private matchesPeriodFilter(recordStart: string, recordEnd: string): boolean {
    if (this.periodMode() === 'ALL') return true;
    const recordStartDay = dateValueToUtcDay(recordStart);
    const recordEndDay = dateValueToUtcDay(recordEnd);
    if (recordStartDay === null || recordEndDay === null) return false;

    if (this.periodMode() === 'YEAR') {
      const year = this.selectedYear();
      return year === null || (recordStartDay <= Date.UTC(year, 11, 31) && recordEndDay >= Date.UTC(year, 0, 1));
    }

    const fromDay = dateValueToUtcDay(this.fromDate());
    const toDay = dateValueToUtcDay(this.toDate());
    if (fromDay !== null && toDay !== null && fromDay > toDay) return false;
    if (fromDay === null && toDay === null) return true;
    return recordStartDay <= (toDay ?? Number.POSITIVE_INFINITY)
      && recordEndDay >= (fromDay ?? Number.NEGATIVE_INFINITY);
  }

  openAdd(): void {
    if (!this.canCreate()) return;
    this.editingId.set(null);
    this.form.reset({ staffMemberId: this.apiService.staff()[0]?.id || '', courseCode: '', courseName: '', providerId: '', hoursCount: null, startDate: '', endDate: '' });
    this.showModal.set(true);
  }

  openEdit(item: StaffDevelopment): void {
    if (!this.canUpdate()) return;
    this.editingId.set(item.id);
    this.form.reset({ staffMemberId: item.staffMemberId, courseCode: item.courseCode, courseName: item.courseName, providerId: item.providerId || item.provider?.id || '', hoursCount: item.hoursCount ?? null, startDate: this.dateInput(item.startDate), endDate: this.dateInput(item.endDate) });
    this.showModal.set(true);
  }

  closeModal(): void { this.showModal.set(false); this.editingId.set(null); }

  async save(): Promise<void> {
    if (this.editingId() ? !this.canUpdate() : !this.canCreate()) return;
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.isSaving.set(true);
    const value = this.form.getRawValue();
    const payload = { ...value, hoursCount: value.hoursCount === null ? null : Number(value.hoursCount) };
    const saved = this.editingId() ? await this.apiService.updateStaffDevelopment(this.editingId()!, payload) : await this.apiService.createStaffDevelopment(payload);
    this.isSaving.set(false);
    if (saved) this.closeModal();
  }

  async remove(item: StaffDevelopment): Promise<void> {
    if (!this.canDelete()) return;
    const confirmed = await this.confirmDialog.confirm({ title: 'حذف سجل الاستكمال', message: `هل تريد حذف استكمال «${item.courseName}»؟`, variant: 'danger' });
    if (confirmed) await this.apiService.deleteStaffDevelopment(item.id);
  }

  dateInput(value: string): string { return value ? new Date(value).toISOString().slice(0, 10) : ''; }
  displayDate(value: string): string { return this.dateInput(value); }
  staffName(item: StaffDevelopment): string { return `${item.staffMember?.firstNameAr || ''} ${item.staffMember?.familyNameAr || ''}`.trim() || 'غير محدد'; }
}
