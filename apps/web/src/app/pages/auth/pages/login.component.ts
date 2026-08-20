import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth.service';
import { LoginHeaderComponent } from '../components/login-header.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-login',
  imports: [ReactiveFormsModule, MatIconModule, LoginHeaderComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  currentLanguage = signal<'ar' | 'he'>('ar');
  showPassword = signal(false);
  isSubmitting = signal(false);
  errorMessage = signal<string | null>(null);

  loginForm = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  get currentYear(): number {
    return new Date().getFullYear();
  }

  isArabic(): boolean {
    return this.currentLanguage() === 'ar';
  }

  isRtl(): boolean {
    return true;
  }

  toggleLanguage(): void {
    this.currentLanguage.set(this.currentLanguage() === 'ar' ? 'he' : 'ar');
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((visible) => !visible);
  }

  private readonly dictionary: Record<string, { ar: string; he: string }> = {
    appTitle: {
      ar: 'أكاديميا - منصة الإدارة والتقييم',
      he: 'אקדמיה - פלטפורמת ניהול והערכה',
    },
    appSubtitle: {
      ar: 'بوابة آمنة للموظفين والمسؤولين',
      he: 'שער מאובטח לצוות ולמנהלים',
    },
    loginTitle: {
      ar: 'تسجيل الدخول للنظام',
      he: 'כניסה למערכת',
    },
    loginSubtitle: {
      ar: 'أدخل البريد الإلكتروني وكلمة المرور المسجلة للمتابعة',
      he: 'הזן דוא״ל וסיסמה כדי להמשיך',
    },
    emailLabel: {
      ar: 'البريد الإلكتروني المهني',
      he: 'כתובת דואר אלקטרוני',
    },
    passwordLabel: {
      ar: 'كلمة المرور',
      he: 'סיסמה',
    },
    fieldRequired: {
      ar: 'هذا الحقل مطلوب',
      he: 'שדה זה הוא חובה',
    },
    invalidEmail: {
      ar: 'يرجى إدخال بريد إلكتروني صحيح',
      he: 'נא להזין דוא״ל תקין',
    },
    signIn: {
      ar: 'دخول آمن',
      he: 'כניסה מאובטחת',
    },
    signingIn: {
      ar: 'جاري التحقق...',
      he: 'מאמת נתונים...',
    },
    footerText: {
      ar: 'منصة أكاديميا الرقمية الموحدة للمدارس. جميع الحقوق محفوظة.',
      he: 'אקדמיה - מערכת דיגיטלית מאוחדת לבתי ספר. כל הזכויות שמורות.',
    },
  };

  t(key: string): string {
    const term = this.dictionary[key];
    if (!term) return key;
    return this.currentLanguage() === 'ar' ? term.ar : term.he;
  }

  async onSubmit(): Promise<void> {
    if (this.loginForm.invalid) return;
    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    try {
      await this.authService.login(
        this.loginForm.controls.email.value,
        this.loginForm.controls.password.value,
      );
      await this.router.navigate(['/']);
    } catch (error) {
      console.error(error);
      this.errorMessage.set(error instanceof Error ? error.message : 'تعذر تسجيل الدخول');
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
