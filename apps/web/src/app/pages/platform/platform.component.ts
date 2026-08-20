import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../core/services/api.service';
import { UiButtonComponent } from '../../shared/components/ui-button/ui-button.component';
import { UiModalComponent } from '../../shared/components/ui-modal/ui-modal.component';

interface LookupItem { id: string; nameAr: string; isActive?: boolean; }
interface PlatformLookups { educationTypes: LookupItem[]; regions: LookupItem[]; institutionStatuses: LookupItem[]; languages: LookupItem[]; }
interface CreateInstitutionDto {
  schoolCode: string;
  slug: string;
  nameAr: string;
  nameHe: string;
  phoneNumber: string;
  email: string;
  typeId: string;
  regionId: string;
  statusId: string;
  defaultLanguageId: string;
}

interface Provider {
  id: string;
  providerCode: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

@Component({ standalone: true, imports: [CommonModule, FormsModule, MatIconModule, UiButtonComponent, UiModalComponent], templateUrl: './platform.component.html' })
export class PlatformComponent {
  private readonly api = inject(ApiService);
  readonly institutions = signal<any[]>([]);
  readonly plans = signal<any[]>([]);
  readonly providers = signal<Provider[]>([]);
  readonly selectedInstitution = signal<any>(null);
  readonly error = signal('');
  readonly success = signal('');
  readonly loading = signal(true);
  readonly creatingInstitution = signal(false);
  readonly showInstitutionForm = signal(false);
  readonly showProviderForm = signal(false);
  readonly savingProvider = signal(false);
  readonly editingProvider = signal<Provider | null>(null);
  readonly providerFormError = signal('');
  readonly institutionFormError = signal('');
  readonly lookups = signal<PlatformLookups>({ educationTypes: [], regions: [], institutionStatuses: [], languages: [] });
  readonly planForm: any = { code: '', nameAr: '', maxStudents: null, maxStaff: null, maxUsers: null };
  readonly subscriptionForm: any = { planId: '', startsAt: '', endsAt: '' };
  readonly adminForm: any = { email: '', firstNameAr: '', familyNameAr: '', phoneNumber: '', nationalId: '' };
  readonly institutionForm: CreateInstitutionDto = { schoolCode: '', slug: '', nameAr: '', nameHe: '', phoneNumber: '', email: '', typeId: '', regionId: '', statusId: '', defaultLanguageId: '' };
  readonly providerForm = { providerCode: '', name: '', sortOrder: 0, isActive: true };

  constructor() { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try {
      const [institutions, plans, providers, lookups] = await Promise.all([
        this.api.apiFetch('/api/platform/institutions'),
        this.api.apiFetch('/api/platform/plans'),
        this.api.apiFetch('/api/platform/providers'),
        this.api.apiFetch('/api/lookups'),
      ]);
      if (!institutions.ok || !plans.ok) throw new Error('تعذر تحميل بيانات المنصة.');
      if (!providers.ok) throw new Error('تعذر تحميل الجهات المقدمة.');
      this.institutions.set(await institutions.json()); this.plans.set(await plans.json());
      this.providers.set(await providers.json());
      if (!lookups.ok) throw new Error('تعذر تحميل الجداول المرجعية.');
      const lookupData = await lookups.json() as PlatformLookups;
      this.lookups.set({ educationTypes: lookupData.educationTypes || [], regions: lookupData.regions || [], institutionStatuses: lookupData.institutionStatuses || [], languages: lookupData.languages || [] });
      this.applyInstitutionDefaults();
      if (!this.subscriptionForm.planId) this.subscriptionForm.planId = this.plans()[0]?.id || '';
    } catch (e) { this.error.set(e instanceof Error ? e.message : 'تعذر تحميل البيانات.'); }
    finally { this.loading.set(false); }
  }

  selectInstitution(institution: any): void { this.selectedInstitution.set(institution); this.subscriptionForm.planId = institution.plan?.id || this.plans()[0]?.id || ''; }

  openInstitutionForm(): void { this.institutionFormError.set(''); this.success.set(''); this.applyInstitutionDefaults(); this.showInstitutionForm.set(true); }
  closeInstitutionForm(): void { if (!this.creatingInstitution()) this.showInstitutionForm.set(false); }

  openProviderForm(provider?: Provider): void {
    this.providerFormError.set('');
    this.editingProvider.set(provider || null);
    Object.assign(this.providerForm, provider
      ? { providerCode: provider.providerCode, name: provider.name, sortOrder: provider.sortOrder, isActive: provider.isActive }
      : { providerCode: '', name: '', sortOrder: 0, isActive: true });
    this.showProviderForm.set(true);
  }

  closeProviderForm(): void {
    if (this.savingProvider()) return;
    this.showProviderForm.set(false);
    this.editingProvider.set(null);
  }

  async saveProvider(): Promise<void> {
    const providerCode = this.providerForm.providerCode.trim();
    const name = this.providerForm.name.trim();
    const sortOrder = Number(this.providerForm.sortOrder);
    if (!providerCode || providerCode.length > 20 || !name || name.length > 150 || !Number.isInteger(sortOrder)) {
      this.providerFormError.set('تحقق من رمز الجهة واسمها وترتيب العرض.');
      return;
    }
    this.savingProvider.set(true);
    this.providerFormError.set('');
    try {
      const editing = this.editingProvider();
      const response = await this.api.apiFetch(editing ? `/api/platform/providers/${editing.id}` : '/api/platform/providers', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({ providerCode, name, sortOrder, isActive: this.providerForm.isActive }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { this.providerFormError.set(body.error || 'تعذر حفظ الجهة المقدمة.'); return; }
      this.success.set(editing ? 'تم تعديل الجهة المقدمة بنجاح.' : 'تمت إضافة الجهة المقدمة بنجاح.');
      this.showProviderForm.set(false);
      this.editingProvider.set(null);
      await this.load();
    } catch {
      this.providerFormError.set('تعذر الاتصال بالخادم. حاول مرة أخرى.');
    } finally {
      this.savingProvider.set(false);
    }
  }

  async toggleProvider(provider: Provider): Promise<void> {
    this.error.set('');
    const response = await this.api.apiFetch(`/api/platform/providers/${provider.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !provider.isActive }),
    });
    if (!response.ok) {
      this.error.set((await response.json().catch(() => ({}))).error || 'تعذر تغيير حالة الجهة المقدمة.');
      return;
    }
    this.success.set(provider.isActive ? 'تم تعطيل الجهة المقدمة.' : 'تم تفعيل الجهة المقدمة.');
    await this.load();
  }

  private applyInstitutionDefaults(): void {
    const data = this.lookups();
    this.institutionForm.typeId ||= data.educationTypes.find(item => item.isActive !== false)?.id || '';
    this.institutionForm.regionId ||= data.regions.find(item => item.isActive !== false)?.id || '';
    this.institutionForm.statusId ||= data.institutionStatuses.find(item => item.isActive !== false)?.id || '';
    this.institutionForm.defaultLanguageId ||= data.languages.find(item => item.isActive !== false)?.id || '';
  }

  private institutionValidationError(): string {
    const form = this.institutionForm;
    if (!form.nameAr.trim() || !form.schoolCode.trim() || !form.typeId || !form.regionId || !form.statusId || !form.defaultLanguageId) return 'يرجى تعبئة جميع الحقول المطلوبة.';
    if (!/^[A-Za-z0-9_-]{2,20}$/.test(form.schoolCode.trim())) return 'رمز المؤسسة يجب أن يكون من 2 إلى 20 حرفًا إنجليزيًا أو رقمًا.';
    if (form.slug && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug.trim()) || form.slug.length > 80)) return 'المعرّف المختصر غير صالح.';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'البريد الإلكتروني غير صالح.';
    if (form.nameAr.length > 200 || form.nameHe.length > 200 || form.phoneNumber.length > 50) return 'أحد الحقول يتجاوز الطول المسموح.';
    return '';
  }

  async createInstitution(): Promise<void> {
    const validationError = this.institutionValidationError();
    if (validationError) { this.institutionFormError.set(validationError); return; }
    this.creatingInstitution.set(true); this.institutionFormError.set(''); this.error.set('');
    try {
      const payload = { ...this.institutionForm, schoolCode: this.institutionForm.schoolCode.trim().toUpperCase(), slug: this.institutionForm.slug.trim().toLowerCase() || undefined, nameAr: this.institutionForm.nameAr.trim(), nameHe: this.institutionForm.nameHe.trim() || undefined, phoneNumber: this.institutionForm.phoneNumber.trim() || undefined, email: this.institutionForm.email.trim().toLowerCase() || undefined };
      const response = await this.api.apiFetch('/api/platform/institutions', { method: 'POST', body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { this.institutionFormError.set(body.error || 'تعذر إنشاء المؤسسة.'); return; }
      const createdId = body.institution?.id;
      Object.assign(this.institutionForm, { schoolCode: '', slug: '', nameAr: '', nameHe: '', phoneNumber: '', email: '', typeId: '', regionId: '', statusId: '', defaultLanguageId: '' });
      this.showInstitutionForm.set(false); this.success.set('تم إنشاء المؤسسة بنجاح. يمكنك الآن إسناد خطة ثم تجهيز المدير الأول.');
      await this.load();
      const created = this.institutions().find(item => item.id === createdId);
      if (created) this.selectInstitution(created);
    } catch { this.institutionFormError.set('تعذر الاتصال بالخادم. حاول مرة أخرى.'); }
    finally { this.creatingInstitution.set(false); }
  }
  async createPlan(): Promise<void> {
    this.error.set('');
    const response = await this.api.apiFetch('/api/platform/plans', { method: 'POST', body: JSON.stringify(this.planForm) });
    if (!response.ok) { this.error.set((await response.json().catch(() => ({}))).error || 'تعذر إنشاء الخطة.'); return; }
    this.success.set('تم إنشاء الخطة بنجاح.'); Object.assign(this.planForm, { code: '', nameAr: '', maxStudents: null, maxStaff: null, maxUsers: null }); await this.load();
  }
  async assignSubscription(): Promise<void> {
    const institution = this.selectedInstitution(); if (!institution || !this.subscriptionForm.planId) return;
    const response = await this.api.apiFetch(`/api/platform/institutions/${institution.id}/subscription`, { method: 'POST', body: JSON.stringify(this.subscriptionForm) });
    if (!response.ok) { this.error.set((await response.json().catch(() => ({}))).error || 'تعذر إسناد الاشتراك.'); return; }
    this.success.set('تم إسناد الاشتراك بنجاح.'); await this.load(); this.selectedInstitution.set(this.institutions().find(item => item.id === institution.id) || null);
  }
  async changeStatus(status: string): Promise<void> { const institution = this.selectedInstitution(); if (!institution) return; const response = await this.api.apiFetch(`/api/platform/institutions/${institution.id}/subscription/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); if (!response.ok) { this.error.set((await response.json().catch(() => ({}))).error || 'تعذر تغيير الحالة.'); return; } this.success.set('تم تحديث حالة الاشتراك.'); await this.load(); this.selectedInstitution.set(this.institutions().find(item => item.id === institution.id) || null); }
  async provisionAdmin(): Promise<void> {
    const institution = this.selectedInstitution(); if (!institution) return;
    const response = await this.api.apiFetch(`/api/platform/institutions/${institution.id}/initial-admin`, { method: 'POST', body: JSON.stringify(this.adminForm) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { this.error.set(body.error || 'تعذر تجهيز المدير الأول.'); return; }
    this.success.set(body.setup?.setupUrl ? `تم تجهيز المدير الأول. رابط الإعداد: ${body.setup.setupUrl}` : 'تم تجهيز المدير الأول.');
    Object.assign(this.adminForm, { email: '', firstNameAr: '', familyNameAr: '', phoneNumber: '', nationalId: '' });
    await this.load(); this.selectedInstitution.set(this.institutions().find(item => item.id === institution.id) || null);
  }

  async reissueAdminSetup(): Promise<void> {
    const institution = this.selectedInstitution(); if (!institution) return;
    const response = await this.api.apiFetch(`/api/platform/institutions/${institution.id}/initial-admin/reissue`, { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { this.error.set(body.error || 'تعذر إعادة إصدار رابط الإعداد.'); return; }
    this.success.set(body.setup?.setupUrl ? `تم إصدار رابط إعداد جديد: ${body.setup.setupUrl}` : 'تم إصدار رابط إعداد جديد.');
    await this.load(); this.selectedInstitution.set(this.institutions().find(item => item.id === institution.id) || null);
  }
}
