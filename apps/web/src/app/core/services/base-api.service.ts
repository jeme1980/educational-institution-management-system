import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

// All API service instances must use the same active tenant context.
const sharedInstitutionId = signal<string | null>(null);
const sharedAcademicYearId = signal<string | null>(null);

@Injectable({
  providedIn: 'root',
})
export class BaseApiService {
  protected authService = inject(AuthService);
  private readonly router = inject(Router);

  public selectedInstitutionId = sharedInstitutionId;
  public selectedAcademicYearId = sharedAcademicYearId;
  public isLoading = signal<boolean>(false);

  public get headers(): Record<string, string> {
    const token = this.authService.idToken();
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      h['Authorization'] = `Bearer ${token}`;
    }
    return h;
  }

  public isValidContextId(value: unknown): value is string {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  public apiUrl(path: string): string {
    if (typeof window !== 'undefined') {
      return path;
    }
    const apiBaseUrl = process.env['API_URL'] || 'http://127.0.0.1:4000';
    return `${apiBaseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : '/' + path}`;
  }

  public async apiFetch(path: string, options?: RequestInit): Promise<Response> {
    await this.authService.waitForAuthInit();
    const originalOptions = options || {};
    const originalHeaders = { ...(originalOptions.headers as Record<string, string> | undefined) };

    const send = () => {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...originalHeaders,
      };
      const token = this.authService.idToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const authContext = this.authService.currentContext();
      const contextInstitutionId = authContext?.institutionId || authContext?.user?.institutionId;
      const contextAcademicYearId = authContext?.academicYear?.id;
      if (!this.isValidContextId(this.selectedInstitutionId()) && this.isValidContextId(contextInstitutionId)) {
        sharedInstitutionId.set(contextInstitutionId);
      }
      if (!this.isValidContextId(this.selectedAcademicYearId()) && this.isValidContextId(contextAcademicYearId)) {
        sharedAcademicYearId.set(contextAcademicYearId);
      }
      delete headers['x-institution-id'];
      delete headers['X-Institution-Id'];
      delete headers['x-academic-year-id'];
      delete headers['X-Academic-Year-Id'];
      const instId = this.selectedInstitutionId();
      if (this.isValidContextId(instId)) headers['x-institution-id'] = instId;
      const yearId = this.selectedAcademicYearId();
      if (this.isValidContextId(yearId)) headers['x-academic-year-id'] = yearId;
      return fetch(this.apiUrl(path), { ...originalOptions, credentials: 'include', headers });
    };

    let response = await send();
    if (response.status === 401) {
      const refreshed = this.authService.idToken() ? await this.authService.refreshSession() : false;
      if (refreshed) response = await send();
      if (response.status === 401) {
        await this.router.navigate(['/login'], { queryParams: { returnUrl: window.location.pathname } });
      }
    }
    return response;
  }

  public async safeJson(res: Response): Promise<any> {
    if (!res || !res.ok) {
      return null;
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return null;
    }
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
}
