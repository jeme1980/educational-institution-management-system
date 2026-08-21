import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, inject, signal, OnInit, effect, ViewChild } from '@angular/core';
import { NavigationStart, RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule, DOCUMENT } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from './core/services/auth.service';
import { ApiService } from './core/services/api.service';
import { FormsModule } from '@angular/forms';
import { UiConfirmDialogComponent } from './shared/components/ui-confirm-dialog/ui-confirm-dialog.component';
import { ConfirmDialogService } from './shared/services/confirm-dialog.service';
import { ThemeService } from './core/services/theme.service';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

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
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  isMobileMenuOpen = signal<boolean>(false);

  @ViewChild('mobileMenuTrigger') private mobileMenuTrigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('mobileMenuPanel') private mobileMenuPanel?: ElementRef<HTMLElement>;
  @ViewChild('mobileMenuClose') private mobileMenuClose?: ElementRef<HTMLButtonElement>;

  constructor() {
    this.router.events
      .pipe(filter(event => event instanceof NavigationStart), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.isMobileMenuOpen()) this.closeMobileMenu(false);
      });

    effect(onCleanup => {
      if (!this.isMobileMenuOpen()) return;

      const previousOverflow = this.document.body.style.overflow;
      this.document.body.style.overflow = 'hidden';
      queueMicrotask(() => this.mobileMenuClose?.nativeElement.focus());

      onCleanup(() => {
        this.document.body.style.overflow = previousOverflow;
      });
    });
  }

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
    if (this.isMobileMenuOpen()) {
      this.closeMobileMenu();
    } else {
      this.isMobileMenuOpen.set(true);
    }
  }

  closeMobileMenu(restoreFocus = true) {
    this.isMobileMenuOpen.set(false);
    if (restoreFocus) queueMicrotask(() => this.mobileMenuTrigger?.nativeElement.focus());
  }

  onMobileMenuKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeMobileMenu();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = Array.from(this.mobileMenuPanel?.nativeElement.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    ) || []);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  @HostListener('window:resize')
  onWindowResize() {
    if (this.isMobileMenuOpen() && window.innerWidth >= 768) this.closeMobileMenu(false);
  }
}
