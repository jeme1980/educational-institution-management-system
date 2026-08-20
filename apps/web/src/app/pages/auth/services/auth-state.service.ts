import { Injectable, inject, computed } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';

@Injectable({ providedIn: 'root' })
export class AuthStateService {
  private authService = inject(AuthService);

  currentUser = this.authService.currentUser;
  userProfile = this.authService.userProfile;
  isLoading = this.authService.isLoading;
  isAuthenticated = computed(() => !!this.authService.currentUser());

  async login(email: string, pass: string) {
    return this.authService.login(email, pass);
  }

  logout() {
    this.authService.logout();
  }
}
