import { Injectable, signal } from '@angular/core';
import { BaseApiService } from './base-api.service';
import { DashboardStats, AcademicYear, AcademicPeriod, AcademicYearActionResult, AcademicYearUpdatePayload, CloseAcademicYearResponse, SetCurrentAcademicYearResponse, Town, LookupItem, GradeLevel } from '../models/api.models';

export type AcademicPeriodActionResult = { success: true; data: AcademicPeriod } | { success: false; error: string; code?: string };

export async function readApiError(res: Response, fallback: string): Promise<{ error: string; code?: string }> {
  const body = await res.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return { error: fallback };
  const nested = body['error'] && typeof body['error'] === 'object' ? body['error'] as Record<string, unknown> : null;
  const error = typeof body['error'] === 'string'
    ? body['error']
    : typeof body['message'] === 'string'
      ? body['message']
      : typeof nested?.['message'] === 'string'
        ? nested['message']
        : fallback;
  const code = typeof body['code'] === 'string' ? body['code'] : typeof nested?.['code'] === 'string' ? nested['code'] : undefined;
  return { error, ...(code ? { code } : {}) };
}

@Injectable({
  providedIn: 'root',
})
export class SettingsApiService extends BaseApiService {
  public stats = signal<DashboardStats | null>(null);
  public academicYears = signal<AcademicYear[]>([]);
  public academicPeriods = signal<AcademicPeriod[]>([]);
  public lookups = signal<any>(null);
  public publicLookups = signal<Record<string, any[]>>({});
  public languages = signal<any[]>([]);
  public appState = signal<any>(null);
  public regions = signal<any[]>([]);
  public educationTypes = signal<any[]>([]);
  public institution = signal<any>(null);
  public institutions = signal<any[]>([]);
  public institutionError = signal('');
  public dashboardError = signal('');
  public towns = signal<Town[]>([]);
  public educationStages = signal<LookupItem[]>([]);
  public gradeLevels = signal<GradeLevel[]>([]);
  public classTypes = signal<LookupItem[]>([]);
  public compositionTypes = signal<LookupItem[]>([]);

  async loadAuditLogs(filters: Record<string, string | number> = {}): Promise<any> {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => String(value).trim() !== '').map(([key, value]) => [key, String(value)]));
    const res = await this.apiFetch(`/api/audit-logs?${query.toString()}`, { headers: this.headers });
    return res.ok ? res.json() : { items: [], total: 0, error: await this.readError(res) };
  }

  async loadSubscription(): Promise<any> {
    try {
      const response = await this.apiFetch('/api/subscription', { headers: this.headers });
      return response.ok ? await response.json() : { error: await this.readError(response) };
    } catch {
      return { error: 'تعذر جلب بيانات الاشتراك.' };
    }
  }

  private lookupItems<T>(data: any): T[] {
    if (Array.isArray(data)) return data as T[];
    if (Array.isArray(data?.items)) return data.items as T[];
    if (Array.isArray(data?.data)) return data.data as T[];
    return [];
  }

  async loadLookups() {
    try {
      const res = await this.apiFetch('/api/lookups');
      const data = await this.safeJson(res);
      if (data) {
        this.lookups.set(data);
        this.educationStages.set(data.educationStages || []);
        this.gradeLevels.set(data.gradeLevels || []);
        this.classTypes.set(data.classTypes || []);
        this.compositionTypes.set(data.compositionTypes || []);
      }
    } catch (e) {
      console.error('Failed to load lookups', e);
    }
  }

  async loadPublicLookups(): Promise<void> {
    try {
      const res = await this.apiFetch('/api/public-lookups', { headers: this.headers });
      const data = await this.safeJson(res);
      if (data) this.publicLookups.set(data);
    } catch (e) {
      console.error('Failed to load public lookups', e);
    }
  }

  async createPublicLookup(table: string, data: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await this.apiFetch(`/api/public-lookups/${table}`, { method: 'POST', headers: this.headers, body: JSON.stringify(data) });
      if (res.ok) {
        await this.loadPublicLookups();
        return true;
      }
    } catch (e) {
      console.error('Failed to create public lookup', e);
    }
    return false;
  }

  async updatePublicLookup(table: string, id: string, data: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await this.apiFetch(`/api/public-lookups/${table}/${id}`, { method: 'PUT', headers: this.headers, body: JSON.stringify(data) });
      if (res.ok) {
        await this.loadPublicLookups();
        return true;
      }
    } catch (e) {
      console.error('Failed to update public lookup', e);
    }
    return false;
  }

  async deletePublicLookup(table: string, id: string): Promise<boolean> {
    try {
      const res = await this.apiFetch(`/api/public-lookups/${table}/${id}`, { method: 'DELETE', headers: this.headers });
      if (res.ok) {
        await this.loadPublicLookups();
        return true;
      }
    } catch (e) {
      console.error('Failed to delete public lookup', e);
    }
    return false;
  }

  async loadDashboardStats(): Promise<boolean> {
    try {
      this.isLoading.set(true);
      this.dashboardError.set('');
      const res = await this.apiFetch('/api/dashboard/stats', { headers: this.headers });
      if (!res.ok) {
        this.dashboardError.set('تعذر تحميل بيانات لوحة القيادة. حاول مرة أخرى.');
        return false;
      }
      const data = await this.safeJson(res);
      if (!data) {
        this.dashboardError.set('تعذر قراءة بيانات لوحة القيادة. حاول مرة أخرى.');
        return false;
      }
      this.stats.set(data);
      return true;
    } catch (e) {
      console.error('Failed to load stats', e);
      this.dashboardError.set('تعذر تحميل بيانات لوحة القيادة. تحقق من الاتصال وحاول مرة أخرى.');
      return false;
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadAcademicYears() {
    try {
      const res = await this.apiFetch('/api/academic-years', { headers: this.headers });
      const data = await this.safeJson(res);
      if (data) {
        this.academicYears.set(data);
      }
    } catch (e) {
      console.error('Failed to load academic years', e);
    }
  }

  async createAcademicYear(data: any): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await this.apiFetch('/api/academic-years', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await this.loadAcademicYears();
        return { success: true };
      } else {
        const err = await res.json().catch(() => ({}));
        return { success: false, error: err.error?.message || err.error || 'Failed to create academic year' };
      }
    } catch (e: any) {
      console.error(e);
      return { success: false, error: e.message || 'Failed to create academic year' };
    }
  }

  async updateAcademicYear(id: string, data: AcademicYearUpdatePayload): Promise<{ success: boolean; error?: string }> {
    try {
      const payload: AcademicYearUpdatePayload = { yearLabel: data.yearLabel, startDate: data.startDate, endDate: data.endDate };
      const res = await this.apiFetch(`/api/academic-years/${id}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await this.loadAcademicYears();
        return { success: true };
      } else {
        const err = await res.json().catch(() => ({}));
        return { success: false, error: err.error?.message || err.error || 'Failed to update academic year' };
      }
    } catch (e: any) {
      console.error(e);
      return { success: false, error: e.message || 'Failed to update academic year' };
    }
  }

  async deleteAcademicYear(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await this.apiFetch(`/api/academic-years/${id}`, {
        method: 'DELETE',
        headers: this.headers,
      });
      if (res.ok) {
        await this.loadAcademicYears();
        return { success: true };
      } else {
        const err = await res.json().catch(() => ({}));
        return { success: false, error: err.error?.message || err.error || 'Failed to delete academic year' };
      }
    } catch (e: any) {
      console.error(e);
      return { success: false, error: e.message || 'Failed to delete academic year' };
    }
  }

  async archiveAcademicYear(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await this.apiFetch(`/api/academic-years/${id}/archive`, { method: 'PATCH', headers: this.headers });
      if (res.ok) {
        await this.loadAcademicYears();
        return { success: true };
      }
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err.error?.message || err.error || 'تعذر أرشفة العام الدراسي.' };
    } catch (e: any) {
      console.error(e);
      return { success: false, error: e.message || 'تعذر الاتصال بالخادم أثناء الأرشفة.' };
    }
  }

  async loadAcademicPeriods(academicYearId?: string) {
    try {
      const query = academicYearId ? `?academicYearId=${encodeURIComponent(academicYearId)}` : '';
      const res = await this.apiFetch(`/api/academic-periods${query}`, { headers: this.headers });
      if (res.ok) {
        const data = await res.json();
        this.academicPeriods.set(this.lookupItems<AcademicPeriod>(data));
      }
    } catch (e) {
      console.error('Failed to load academic periods', e);
    }
  }

  async createAcademicPeriod(data: any): Promise<AcademicPeriodActionResult> {
    try {
      const res = await this.apiFetch('/api/academic-periods', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const created = await res.json() as AcademicPeriod;
        this.academicPeriods.update((items) => [...items.filter((item) => item.id !== created.id), created]);
        return { success: true, data: created };
      }
      return { success: false, ...await readApiError(res, 'تعذر حفظ الفترة الدراسية.') };
    } catch (e) {
      console.error(e);
      return { success: false, error: 'تعذر حفظ الفترة الدراسية.' };
    }
  }

  async updateAcademicPeriod(id: string, data: any): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await this.apiFetch(`/api/academic-periods/${id}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await this.loadAcademicPeriods();
        return { success: true };
      } else {
        const err = await res.json().catch(() => ({}));
        return { success: false, error: err.error || 'Failed to update academic period' };
      }
    } catch (e: any) {
      console.error(e);
      return { success: false, error: e.message || 'Failed to update academic period' };
    }
  }

  async deleteAcademicPeriod(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await this.apiFetch(`/api/academic-periods/${id}`, {
        method: 'DELETE',
        headers: this.headers,
      });
      if (res.ok) {
        await this.loadAcademicPeriods();
        return { success: true };
      } else {
        const err = await res.json().catch(() => ({}));
        return { success: false, error: err.error || 'Failed to delete academic period' };
      }
    } catch (e: any) {
      console.error(e);
      return { success: false, error: e.message || 'Failed to delete academic period' };
    }
  }

  async loadLanguages() {
    try {
      this.isLoading.set(true);
      const res = await this.apiFetch('/api/languages');
      if (res.ok) {
        const data = await res.json();
        this.languages.set(data);
      }
    } catch (e) {
      console.error('Failed to load languages', e);
    } finally {
      this.isLoading.set(false);
    }
  }

  async createLanguage(langData: any) {
    try {
      const res = await this.apiFetch('/api/languages', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(langData),
      });
      if (res.ok) {
        await this.loadLanguages();
        await this.loadLookups();
        return true;
      }
    } catch (e) {
      console.error('Failed to create language', e);
    }
    return false;
  }

  async updateLanguage(code: string, langData: any) {
    try {
      const res = await this.apiFetch(`/api/languages/${code}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(langData),
      });
      if (res.ok) {
        await this.loadLanguages();
        await this.loadLookups();
        return true;
      }
    } catch (e) {
      console.error('Failed to update language', e);
    }
    return false;
  }

  async deleteLanguage(code: string) {
    try {
      const res = await this.apiFetch(`/api/languages/${code}`, {
        method: 'DELETE',
        headers: this.headers,
      });
      if (res.ok) {
        await this.loadLanguages();
        await this.loadLookups();
        return true;
      }
    } catch (e) {
      console.error('Failed to delete language', e);
    }
    return false;
  }

  async loadAppState() {
    try {
      this.isLoading.set(true);
      const res = await this.apiFetch('/api/app-state');
      if (res.ok) {
        const data = await res.json();
        this.appState.set(data);
      }
    } catch (e) {
      console.error('Failed to load app state', e);
    } finally {
      this.isLoading.set(false);
    }
  }

  async updateAppState(stateData: any) {
    try {
      const res = await this.apiFetch('/api/app-state', {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify({ data: stateData }),
      });
      if (res.ok) {
        const updated = await res.json();
        this.appState.set(updated);
        return true;
      }
    } catch (e) {
      console.error('Failed to update app state', e);
    }
    return false;
  }

  async loadRegions() {
    try {
      this.isLoading.set(true);
      const res = await this.apiFetch('/api/regions');
      if (res.ok) {
        const data = await res.json();
        this.regions.set(data);
      }
    } catch (e) {
      console.error('Failed to load regions', e);
    } finally {
      this.isLoading.set(false);
    }
  }

  async createRegion(regionData: any) {
    try {
      const res = await this.apiFetch('/api/regions', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(regionData),
      });
      if (res.ok) {
        await this.loadRegions();
        await this.loadLookups();
        return true;
      }
    } catch (e) {
      console.error('Failed to create region', e);
    }
    return false;
  }

  async updateRegion(code: string, regionData: any) {
    try {
      const res = await this.apiFetch(`/api/regions/${code}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(regionData),
      });
      if (res.ok) {
        await this.loadRegions();
        await this.loadLookups();
        return true;
      }
    } catch (e) {
      console.error('Failed to update region', e);
    }
    return false;
  }

  async deleteRegion(code: string) {
    try {
      const res = await this.apiFetch(`/api/regions/${code}`, {
        method: 'DELETE',
        headers: this.headers,
      });
      if (res.ok) {
        await this.loadRegions();
        await this.loadLookups();
        return true;
      }
    } catch (e) {
      console.error('Failed to delete region', e);
    }
    return false;
  }

  async loadInstitutions() {
    this.institutionError.set('');
    try {
      this.isLoading.set(true);
      const res = await this.apiFetch('/api/institutions');
      if (res.ok) {
        const data = await res.json();
        this.institutions.set(data || []);
        if (data && data.length > 0) {
          this.institution.set(data[0]);
        }
      } else {
        this.institutionError.set(await this.readError(res));
      }
    } catch (e) {
      console.error('Failed to load institutions', e);
      this.institutionError.set('تعذر تحميل المؤسسات من الخادم.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadInstitution() {
    return this.loadInstitutions();
  }

  async loadInstitutionProfile(): Promise<boolean> {
    try {
      const res = await this.apiFetch('/api/settings/institution-profile', { headers: this.headers });
      if (!res.ok) {
        this.institutionError.set(await this.readError(res));
        return false;
      }
      const data = await res.json();
      this.institution.set(data.institution || null);
      this.institutions.set(data.institution ? [data.institution] : []);
      if (Array.isArray(data.academicYears)) this.academicYears.set(data.academicYears);
      return true;
    } catch (e) {
      console.error('Failed to load institution profile', e);
      this.institutionError.set('تعذر تحميل إعدادات المؤسسة.');
      return false;
    }
  }

  async updateInstitutionProfile(data: Record<string, unknown>): Promise<boolean> {
    this.institutionError.set('');
    try {
      const res = await this.apiFetch('/api/settings/institution-profile', {
        method: 'PATCH', headers: this.headers, body: JSON.stringify(data),
      });
      if (!res.ok) {
        this.institutionError.set(await this.readError(res));
        return false;
      }
      const updated = await res.json();
      this.institution.set(updated);
      this.institutions.set([updated]);
      return true;
    } catch (e) {
      console.error('Failed to update institution profile', e);
      this.institutionError.set('تعذر حفظ إعدادات المؤسسة.');
      return false;
    }
  }

  async closeAcademicYear(id: string): Promise<AcademicYearActionResult<CloseAcademicYearResponse>> {
    try {
      const res = await this.apiFetch(`/api/settings/academic-years/${id}/close`, { method: 'PATCH', headers: this.headers });
      const body = await res.json().catch(() => null) as (CloseAcademicYearResponse & { code?: string; error?: string }) | null;
      if (!res.ok || !body?.academicYear) return { success: false, error: body?.error || 'تعذر إغلاق السنة الدراسية.', code: body?.code };
      await this.loadAcademicYears();
      return { success: true, data: body };
    } catch (e: any) {
      return { success: false, error: e?.message || 'تعذر إغلاق السنة الدراسية.' };
    }
  }

  async setCurrentAcademicYear(id: string): Promise<AcademicYearActionResult<SetCurrentAcademicYearResponse>> {
    try {
      const res = await this.apiFetch(`/api/settings/academic-years/${id}/current`, { method: 'PATCH', headers: this.headers });
      const body = await res.json().catch(() => null) as (SetCurrentAcademicYearResponse & { code?: string; error?: string }) | null;
      if (res.ok && body?.id) {
        await this.loadAcademicYears();
        return { success: true, data: body };
      }
      return { success: false, error: body?.error || 'تعذر تغيير العام الدراسي الحالي.', code: body?.code };
    } catch (e: any) {
      return { success: false, error: e?.message || 'تعذر تغيير العام الدراسي الحالي.' };
    }
  }

  async createInstitution(instData: any) {
    this.institutionError.set('');
    try {
      let res = await this.apiFetch('/api/institutions', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(instData),
      });
      if (res.status === 401 && await this.authService.refreshSession()) {
        res = await this.apiFetch('/api/institutions', { method: 'POST', headers: this.headers, body: JSON.stringify(instData) });
      }
      if (res.ok) {
        await this.loadInstitutions();
        return true;
      }
      this.institutionError.set(await this.readError(res));
    } catch (e) {
      console.error('Failed to create institution', e);
      this.institutionError.set('تعذر الاتصال بالخادم أثناء إنشاء المؤسسة.');
    }
    return false;
  }

  async updateInstitution(id: string, instData: any) {
    this.institutionError.set('');
    try {
      let res = await this.apiFetch(`/api/institutions/${id}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(instData),
      });
      if (res.status === 401 && await this.authService.refreshSession()) {
        res = await this.apiFetch(`/api/institutions/${id}`, { method: 'PUT', headers: this.headers, body: JSON.stringify(instData) });
      }
      if (res.ok) {
        await this.loadInstitutions();
        return true;
      }
      this.institutionError.set(await this.readError(res));
    } catch (e) {
      console.error('Failed to update institution', e);
      this.institutionError.set('تعذر الاتصال بالخادم أثناء تعديل المؤسسة.');
    }
    return false;
  }

  async deleteInstitution(id: string) {
    this.institutionError.set('');
    try {
      let res = await this.apiFetch(`/api/institutions/${id}`, {
        method: 'DELETE',
        headers: this.headers,
      });
      if (res.status === 401 && await this.authService.refreshSession()) {
        res = await this.apiFetch(`/api/institutions/${id}`, { method: 'DELETE', headers: this.headers });
      }
      if (res.ok) {
        await this.loadInstitutions();
        return true;
      }
      this.institutionError.set(await this.readError(res));
    } catch (e) {
      console.error('Failed to delete institution', e);
      this.institutionError.set('تعذر الاتصال بالخادم أثناء أرشفة المؤسسة.');
    }
    return false;
  }

  private async readError(res: Response): Promise<string> {
    try {
      const body = await res.json();
      return body?.error?.message || body?.error || `تعذر تنفيذ العملية (HTTP ${res.status}).`;
    } catch {
      return `تعذر تنفيذ العملية (HTTP ${res.status}).`;
    }
  }

  async loadEducationTypes() {
    try {
      this.isLoading.set(true);
      const res = await this.apiFetch('/api/education-types');
      if (res.ok) {
        const data = await res.json();
        this.educationTypes.set(data);
      }
    } catch (e) {
      console.error('Failed to load education types', e);
    } finally {
      this.isLoading.set(false);
    }
  }

  async createEducationType(data: any) {
    try {
      const res = await this.apiFetch('/api/education-types', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await this.loadEducationTypes();
        await this.loadLookups();
        return true;
      }
    } catch (e) {
      console.error('Failed to create education type', e);
    }
    return false;
  }

  async updateEducationType(code: string, data: any) {
    try {
      const res = await this.apiFetch(`/api/education-types/${code}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await this.loadEducationTypes();
        await this.loadLookups();
        return true;
      }
    } catch (e) {
      console.error('Failed to update education type', e);
    }
    return false;
  }

  async deleteEducationType(code: string) {
    try {
      const res = await this.apiFetch(`/api/education-types/${code}`, {
        method: 'DELETE',
        headers: this.headers,
      });
      if (res.ok) {
        await this.loadEducationTypes();
        await this.loadLookups();
        return true;
      }
    } catch (e) {
      console.error('Failed to delete education type', e);
    }
    return false;
  }

  // Towns CRUD
  async loadTowns() {
    try {
      const res = await this.apiFetch('/api/towns');
      const data = await this.safeJson(res);
      if (Array.isArray(data)) {
        this.towns.set(data);
      }
    } catch (e) {
      console.error('Failed to load towns', e);
    }
  }

  async createTown(data: { nameAr: string; nameHe?: string | null }): Promise<{ success: boolean; error?: string; item?: Town }> {
    try {
      const res = await this.apiFetch('/api/towns', {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(data),
      });
      const resData = await this.safeJson(res);
      if (res.ok) {
        await this.loadTowns();
        return { success: true, item: resData };
      }
      return { success: false, error: resData?.error || 'فشلت عملية إضافة البلدة' };
    } catch (e: any) {
      console.error('Failed to create town', e);
      return { success: false, error: 'حدث خطأ في الاتصال بالخادم' };
    }
  }

  async updateTown(id: string, data: { nameAr: string; nameHe?: string | null }): Promise<{ success: boolean; error?: string; item?: Town }> {
    try {
      const res = await this.apiFetch(`/api/towns/${id}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify(data),
      });
      const resData = await this.safeJson(res);
      if (res.ok) {
        await this.loadTowns();
        return { success: true, item: resData };
      }
      return { success: false, error: resData?.error || 'فشلت عملية تحديث بيانات البلدة' };
    } catch (e: any) {
      console.error('Failed to update town', e);
      return { success: false, error: 'حدث خطأ في الاتصال بالخادم' };
    }
  }

  async deleteTown(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await this.apiFetch(`/api/towns/${id}`, {
        method: 'DELETE',
        headers: this.headers,
      });
      if (res.ok) {
        await this.loadTowns();
        return { success: true };
      }
      const resData = await this.safeJson(res);
      return { success: false, error: resData?.error || 'فشلت عملية حذف البلدة' };
    } catch (e: any) {
      console.error('Failed to delete town', e);
      return { success: false, error: 'حدث خطأ في الاتصال بالخادم' };
    }
  }
}
