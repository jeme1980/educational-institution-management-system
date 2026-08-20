import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { User, UserContext } from '../models/auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  currentUser = signal<any | null>(null);
  userProfile = signal<User | null>(null);
  idToken = signal<string | null>(null);
  currentContext = signal<UserContext | null>(null);
  isLoading = signal<boolean>(true);

  private readonly authInitPromise: Promise<void>;
  private authInitResolve!: () => void;
  private refreshInFlight: Promise<boolean> | null = null;

  constructor() {
    this.authInitPromise = new Promise<void>((resolve) => {
      this.authInitResolve = resolve;
    });
    void this.restoreSession();
  }

  waitForAuthInit(): Promise<void> {
    return this.authInitPromise;
  }

  async login(email: string, password: string): Promise<UserContext> {
    this.isLoading.set(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json().catch(() => ({})) as {
        token?: string;
        error?: unknown;
      };
      if (!response.ok || !body.token) {
        const nestedError = body.error && typeof body.error === 'object'
          ? body.error as { message?: unknown; error?: unknown }
          : null;
        const message = typeof body.error === 'string'
          ? body.error
          : typeof nestedError?.message === 'string'
            ? nestedError.message
            : typeof nestedError?.error === 'string'
              ? nestedError.error
              : `تعذر تسجيل الدخول (HTTP ${response.status}).`;
        throw new Error(message);
      }
      return this.loadAuthenticatedContext(body.token);
    } finally {
      this.isLoading.set(false);
    }
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const token = this.idToken();
    if (!token) throw new Error('Authentication is required.');
    const response = await fetch('/api/auth/change-password', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword: newPassword }),
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(body.error || 'تعذر تغيير كلمة المرور.');
    this.clearSession();
    await this.router.navigateByUrl('/login');
  }

  async logout(): Promise<void> {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
    this.clearSession();
    await this.router.navigateByUrl('/login');
  }

  hasPermission(permissionCode: string): boolean {
    const context = this.currentContext();
    return Boolean(context && context.permissions.includes(permissionCode));
  }

  async refreshSession(): Promise<boolean> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.performRefresh().finally(() => { this.refreshInFlight = null; });
    return this.refreshInFlight;
  }

  private async restoreSession(): Promise<void> {
    try {
      if (await this.refreshSession()) return;
      this.clearSession();
    } catch (error) {
      console.error('Unable to restore the local authentication session:', error);
      if (!this.currentContext() && this.idToken()) {
        this.isLoading.set(false);
        this.authInitResolve();
        return;
      }
      this.clearSession();
    } finally {
      this.isLoading.set(false);
      this.authInitResolve();
    }
  }

  private async performRefresh(): Promise<boolean> {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      const body = await response.json().catch(() => ({})) as {
        token?: string;
        accessToken?: string;
      };
      const token = body.accessToken || body.token;
      if (!response.ok || !token) throw new Error('Refresh failed');
      await this.loadAuthenticatedContext(token);
      return true;
    } catch {
      this.clearSession();
      return false;
    }
  }

  private async loadAuthenticatedContext(token: string): Promise<UserContext> {
    if (!this.isJwt(token)) {
      throw new Error('جلسة الدخول الحالية غير صالحة. يرجى تسجيل الدخول من جديد.');
    }
    const response = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error || 'تعذر تحميل ملف المستخدم.');
    }
    const context = await response.json() as UserContext;
    this.idToken.set(token);
    this.currentContext.set(context);
    this.userProfile.set(context.user);
    this.currentUser.set(context.user);
    return context;
  }

  private isJwt(value: unknown): value is string {
    return typeof value === 'string'
      && value.split('.').length === 3
      && value.split('.').every(Boolean);
  }

  private clearSession(): void {
    this.idToken.set(null);
    this.currentContext.set(null);
    this.userProfile.set(null);
    this.currentUser.set(null);
  }
}
