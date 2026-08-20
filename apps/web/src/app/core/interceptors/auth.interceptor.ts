import { HttpContextToken, HttpInterceptorFn, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

const refreshAttempted = new HttpContextToken<boolean>(() => false);

export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const authService = inject(AuthService);
  const token = authService.idToken();
  const context = authService.currentContext();

  let headers = req.headers;

  if (token) {
    headers = headers.set('Authorization', `Bearer ${token}`);
  }

  if (context) {
    if (context.institutionId) {
      headers = headers.set('X-Institution-Id', context.institutionId);
    }
    if (context.academicYear?.id) {
      headers = headers.set('X-Academic-Year-Id', context.academicYear.id);
    }
  }

  const authReq = req.clone({ headers, withCredentials: true });
  return next(authReq).pipe(catchError((error: unknown) => {
    const status = (error as { status?: number })?.status;
    const isAuthEndpoint = req.url.includes('/auth/login') || req.url.includes('/auth/refresh');
    if (status !== 401 || isAuthEndpoint || req.context.get(refreshAttempted)) {
      return throwError(() => error);
    }
    return from(authService.refreshSession()).pipe(
      switchMap((refreshed) => {
        if (!refreshed) return throwError(() => error);
        const token = authService.idToken();
        const retry = req.clone({
          context: req.context.set(refreshAttempted, true),
          setHeaders: token ? { Authorization: `Bearer ${token}` } : {},
        });
        return next(retry);
      }),
      catchError(() => throwError(() => error)),
    );
  }));
};
