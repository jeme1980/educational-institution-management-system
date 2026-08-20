import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const platformGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoading()) await auth.waitForAuthInit();
  return auth.currentContext()?.isPlatformAdmin === true ? true : router.createUrlTree(['/']);
};
