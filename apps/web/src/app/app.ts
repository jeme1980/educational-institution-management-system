import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, HostListener, inject, signal, OnInit, effect, ViewChild } from '@angular/core';
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

export interface SchoolNavItem {
  path: string;
  label: string;
  icon: string;
  permission?: string;
}

export const SCHOOL_NAV_ITEMS: SchoolNavItem[] = [
  { path: '/dashboard', label: 'لوحة القيادة', icon: 'grid_view' },
  { path: '/school-dashboard', label: 'لوحة المدرسة', icon: 'insights', permission: 'exams:read' },
  { path: '/students', label: 'قائمة الطلاب', icon: 'groups', permission: 'students:read' },
  { path: '/attendance', label: 'الحضور والغياب', icon: 'event_available', permission: 'attendance:read' },
  { path: '/enrollments', label: 'بيانات الالتحاق', icon: 'badge', permission: 'students:update' },
  { path: '/registered-students', label: 'الطلاب المسجلون', icon: 'assignment_ind', permission: 'students:read' },
  { path: '/staff', label: 'الكادر والتعيينات', icon: 'supervisor_account', permission: 'teachers:read' },
  { path: '/staff-development', label: 'إدارة الاستكمالات', icon: 'workspace_premium', permission: 'teachers:read' },
  { path: '/classes', label: 'الشعب والصفوف', icon: 'meeting_room', permission: 'settings:read' },
  { path: '/study-groups', label: 'مجموعات الدراسة', icon: 'diversity_3', permission: 'settings:read' },
  { path: '/subjects', label: 'المناهج والمواد', icon: 'menu_book', permission: 'settings:read' },
  { path: '/exams', label: 'الامتحانات', icon: 'assignment', permission: 'exams:read' },
  { path: '/exam-analysis', label: 'تحليل الامتحان', icon: 'analytics', permission: 'exams:read' },
  { path: '/progress-tracking', label: 'مسار التقدم', icon: 'trending_up', permission: 'exams:read' },
  { path: '/action-center', label: 'مركز المتابعة التربوية', icon: 'fact_check', permission: 'exams:read' },
  { path: '/interventions', label: 'خطط التدخل', icon: 'assignment_turned_in', permission: 'exams:read' },
  { path: '/academic-years', label: 'الأعوام الدراسية', icon: 'calendar_today', permission: 'settings:read' },
  { path: '/settings', label: 'الإعدادات', icon: 'settings', permission: 'settings:read' },
];

export function filterSchoolNavItems(items: SchoolNavItem[], permissions: readonly string[]): SchoolNavItem[] {
  return items.filter((item) => !item.permission || permissions.includes(item.permission));
}

export function resolveSelectedId<T extends { id: string }>(items: readonly T[], currentId: string | null | undefined, fallback?: (item: T) => boolean): string | null {
  return items.find((item) => item.id === currentId)?.id || items.find((item) => fallback?.(item))?.id || items[0]?.id || null;
}

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
  readonly schoolNavItems = SCHOOL_NAV_ITEMS;
  readonly visibleSchoolNavItems = computed(() => filterSchoolNavItems(this.schoolNavItems, this.authService.currentContext()?.permissions || []));

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
    if (this.authService.isLoading()) await this.authService.waitForAuthInit();
    if (!this.authService.currentContext()) return;
    if (this.authService.currentContext()?.isPlatformAdmin) { await this.router.navigateByUrl('/platform'); return; }
    await this.apiService.loadInstitutions();
    const institutions = this.apiService.institutions();
    const selectedInstitution = resolveSelectedId(institutions, this.apiService.selectedInstitutionId());
    this.apiService.setSelectedInstitutionId(selectedInstitution);
    await this.reloadAcademicYears();
  }

  async onInstitutionChange(institutionId: string) {
    if (!this.apiService.institutions().some((institution) => institution.id === institutionId)) return;
    this.apiService.setSelectedInstitutionId(institutionId);
    this.apiService.setSelectedAcademicYearId(null);
    await this.reloadAcademicYears();
    await this.apiService.loadCurrentContextData();
  }

  async onAcademicYearChange(academicYearId: string) {
    if (!this.apiService.academicYears().some((year) => year.id === academicYearId)) return;
    this.apiService.setSelectedAcademicYearId(academicYearId);
    await this.apiService.loadCurrentContextData();
  }

  private async reloadAcademicYears() {
    await this.apiService.loadAcademicYears();
    const years = this.apiService.academicYears();
    const selectedYear = resolveSelectedId(years, this.apiService.selectedAcademicYearId(), (item) => item.isCurrent);
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
