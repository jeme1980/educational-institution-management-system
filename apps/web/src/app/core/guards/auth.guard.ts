import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoading()) {
    await authService.waitForAuthInit();
  }

  if (authService.idToken()) {
    if (authService.currentContext()?.isPlatformAdmin && !state.url.startsWith('/platform')) {
      return router.createUrlTree(['/platform']);
    }
    return true;
  }

  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url }
  });
};
