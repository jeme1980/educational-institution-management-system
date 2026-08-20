import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from './core/services/auth.service';
import { ApiService } from './core/services/api.service';
import { FormsModule } from '@angular/forms';
import { UiConfirmDialogComponent } from './shared/components/ui-confirm-dialog/ui-confirm-dialog.component';
import { ConfirmDialogService } from './shared/services/confirm-dialog.service';
import { ThemeService } from './core/services/theme.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, MatIconModule, FormsModule, UiConfirmDialogComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  authService = inject(AuthService);
  apiService = inject(ApiService);
  confirmDialogService = inject(ConfirmDialogService);
  themeService = inject(ThemeService);
  router = inject(Router);
  isMobileMenuOpen = signal<boolean>(false);

  async ngOnInit() {
    if (this.authService.currentContext()?.isPlatformAdmin) { await this.router.navigateByUrl('/platform'); return; }
    await this.apiService.loadInstitutions();
    const institutions = this.apiService.institutions();
    const selectedInstitution = institutions.some((item: any) => item.id === this.apiService.selectedInstitutionId())
      ? this.apiService.selectedInstitutionId()
      : institutions[0]?.id || null;
    this.apiService.setSelectedInstitutionId(selectedInstitution);
    await this.reloadAcademicYears();
  }

  async onInstitutionChange(institutionId: string) {
    this.apiService.setSelectedInstitutionId(institutionId);
    this.apiService.setSelectedAcademicYearId(null);
    await this.reloadAcademicYears();
    await this.apiService.loadCurrentContextData();
  }

  async onAcademicYearChange(academicYearId: string) {
    this.apiService.setSelectedAcademicYearId(academicYearId);
    await this.apiService.loadCurrentContextData();
  }

  private async reloadAcademicYears() {
    await this.apiService.loadAcademicYears();
    const years = this.apiService.academicYears();
    const selectedYear = years.some((item: any) => item.id === this.apiService.selectedAcademicYearId())
      ? this.apiService.selectedAcademicYearId()
      : (years.find((item: any) => item.isCurrent)?.id || years[0]?.id || null);
    this.apiService.setSelectedAcademicYearId(selectedYear);
  }

  toggleMobileMenu() {
    this.isMobileMenuOpen.update(v => !v);
  }

  closeMobileMenu() {
    this.isMobileMenuOpen.set(false);
  }
}
