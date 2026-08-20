import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const permissionGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoading()) {
    await authService.waitForAuthInit();
  }

  const requiredPermission = route.data?.['requiredPermission'];
  if (!requiredPermission) {
    return true;
  }

  if (authService.hasPermission(requiredPermission)) {
    return true;
  }

  console.warn(`Access denied: Missing required permission [${requiredPermission}]`);
  return router.createUrlTree(['/']);
};
