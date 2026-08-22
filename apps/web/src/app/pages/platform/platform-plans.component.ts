import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../core/services/api.service';
import { UiButtonComponent } from '../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../shared/components/input/ui-input.component';
import { UiModalComponent } from '../../shared/components/ui-modal/ui-modal.component';
import { UiTableActionsComponent } from '../../shared/components/ui-table-actions/ui-table-actions.component';

interface PlatformPlan {
  id: string;
  code: string;
  nameAr: string;
  nameHe?: string | null;
  maxStudents?: number | null;
  isActive: boolean;
}

@Component({
  selector: 'app-platform-plans',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, UiButtonComponent, UiInputComponent, UiModalComponent, UiTableActionsComponent],
  template: `
    <section dir="rtl" class="space-y-5">
      <header class="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p class="text-sm font-semibold text-primary">Platform Admin</p>
          <h1 class="mt-1 text-2xl font-bold text-on-surface">الخطط والاشتراكات</h1>
          <p class="mt-2 text-sm text-on-surface-variant">إدارة خطط المنصة وحدود الطلاب وحالة الإتاحة.</p>
        </div>
        <ui-button (activated)="openCreate()"><mat-icon aria-hidden="true">add</mat-icon><span>إضافة خطة</span></ui-button>
      </header>

      @if (toast(); as message) {
        <p class="rounded-md px-3 py-2 text-sm font-semibold" [class.bg-success-container]="message.type === 'success'" [class.text-success]="message.type === 'success'" [class.bg-danger-container]="message.type === 'error'" [class.text-danger]="message.type === 'error'" role="status">{{ message.text }}</p>
      }

      <div class="overflow-x-auto rounded-md border border-surface-border bg-surface">
        <table class="w-full min-w-[720px] text-right text-sm">
          <thead class="bg-surface-container-low text-on-surface-variant"><tr><th class="h-10 px-4">الرمز</th><th class="h-10 px-4">الخطة</th><th class="h-10 px-4">حد الطلاب</th><th class="h-10 px-4">الحالة</th><th class="h-10 px-4 text-center">الإجراءات</th></tr></thead>
          <tbody>
            @for (item of plans(); track item.id) {
              <tr class="h-[52px] border-t border-surface-border">
                <td class="px-4 font-mono text-xs">{{ item.code }}</td>
                <td class="px-4 font-semibold text-on-surface">{{ item.nameAr }}</td>
                <td class="px-4 text-on-surface-variant">{{ item.maxStudents ?? 'غير محدود' }}</td>
                <td class="px-4"><span class="rounded-full px-2.5 py-1 text-xs font-semibold" [class.bg-success-container]="item.isActive" [class.text-success]="item.isActive" [class.bg-neutral-container]="!item.isActive" [class.text-neutral]="!item.isActive">{{ item.isActive ? 'نشطة' : 'معطلة' }}</span></td>
                <td class="px-4 text-center"><ui-table-actions><ui-button size="sm" [iconOnly]="true" variant="ghost" (activated)="openEdit(item)" [ariaLabel]="'تعديل ' + item.nameAr"><mat-icon aria-hidden="true">edit</mat-icon></ui-button><ui-button size="sm" [iconOnly]="true" variant="ghost" (activated)="toggle(item)" [ariaLabel]="(item.isActive ? 'تعطيل ' : 'تفعيل ') + item.nameAr" [loading]="savingId() === item.id"><mat-icon aria-hidden="true">{{ item.isActive ? 'toggle_off' : 'toggle_on' }}</mat-icon></ui-button></ui-table-actions></td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="p-8 text-center text-on-surface-variant">لا توجد خطط.</td></tr>
            }
          </tbody>
        </table>
      </div>

      <ui-modal [open]="showModal()" [title]="(editing() ? 'تعديل خطة - ' : 'إضافة خطة - ') + (editing()?.nameAr || 'خطة جديدة')" [closeOnBackdrop]="!saving()" [closeOnEscape]="!saving()" (closed)="closeModal()">
        <form id="platform-plan-form" ui-modal-body class="grid gap-4 sm:grid-cols-2" (ngSubmit)="save()">
          @if (formError()) { <p class="sm:col-span-2 rounded-md bg-danger-container px-3 py-2 text-sm font-semibold text-danger" role="alert">{{ formError() }}</p> }
          <label class="text-sm font-semibold">رمز الخطة <ui-input name="code" [(ngModel)]="form.code" [readOnly]="!!editing()" [required]="!editing()" dir="ltr" /></label>
          <label class="text-sm font-semibold">اسم الخطة * <ui-input name="nameAr" [(ngModel)]="form.nameAr" [required]="true" /></label>
          <label class="text-sm font-semibold">الاسم العبري <ui-input name="nameHe" [(ngModel)]="form.nameHe" /></label>
          <label class="text-sm font-semibold">حد الطلاب <ui-input name="maxStudents" type="number" min="0" [(ngModel)]="form.maxStudents" placeholder="اتركه فارغًا لغير محدود" /></label>
        </form>
        <div ui-modal-footer class="flex gap-2"><ui-button variant="secondary" type="button" [disabled]="saving()" (activated)="closeModal()">إلغاء</ui-button><ui-button type="submit" form="platform-plan-form" [loading]="saving()"><mat-icon aria-hidden="true">save</mat-icon><span>حفظ</span></ui-button></div>
      </ui-modal>
    </section>
  `,
  styles: [':host { display: block; }'],
})
export class PlatformPlansComponent {
  private readonly api = inject(ApiService);
  readonly plans = signal<PlatformPlan[]>([]);
  readonly editing = signal<PlatformPlan | null>(null);
  readonly showModal = signal(false);
  readonly saving = signal(false);
  readonly savingId = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly toast = signal<{ type: 'success' | 'error'; text: string } | null>(null);
  form: { code: string; nameAr: string; nameHe: string; maxStudents: number | string | null } = { code: '', nameAr: '', nameHe: '', maxStudents: null };

  constructor() { void this.load(); }

  async load(): Promise<void> {
    const response = await this.api.apiFetch('/api/platform/plans');
    if (response.ok) this.plans.set(await response.json());
    else this.notify('error', await this.readError(response));
  }

  openCreate(): void {
    this.editing.set(null);
    this.formError.set(null);
    this.form = { code: '', nameAr: '', nameHe: '', maxStudents: null };
    this.showModal.set(true);
  }

  openEdit(plan: PlatformPlan): void {
    this.editing.set(plan);
    this.formError.set(null);
    this.form = { code: plan.code, nameAr: plan.nameAr, nameHe: plan.nameHe || '', maxStudents: plan.maxStudents ?? null };
    this.showModal.set(true);
  }

  closeModal(): void {
    if (this.saving()) return;
    this.showModal.set(false);
    this.editing.set(null);
    this.formError.set(null);
  }

  async save(): Promise<void> {
    if (this.saving()) return;
    const editing = this.editing();
    const nameAr = this.form.nameAr.trim();
    const code = this.form.code.trim();
    const limit = this.form.maxStudents === '' || this.form.maxStudents === null ? null : Number(this.form.maxStudents);
    if ((!editing && !code) || !nameAr || (limit !== null && (!Number.isInteger(limit) || limit < 0))) {
      this.formError.set(!nameAr ? 'اسم الخطة مطلوب.' : !editing && !code ? 'رمز الخطة مطلوب.' : 'حد الطلاب يجب أن يكون رقمًا صحيحًا غير سالب.');
      return;
    }
    this.saving.set(true);
    this.formError.set(null);
    try {
      const payload: Record<string, unknown> = { nameAr, nameHe: this.form.nameHe.trim() || null, maxStudents: limit };
      if (!editing) payload['code'] = code;
      const response = await this.api.apiFetch(editing ? `/api/platform/plans/${editing.id}` : '/api/platform/plans', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      if (!response.ok) { this.formError.set(await this.readError(response)); return; }
      this.showModal.set(false);
      this.editing.set(null);
      this.notify('success', editing ? 'تم تعديل الخطة بنجاح.' : 'تمت إضافة الخطة بنجاح.');
      await this.load();
    } catch { this.formError.set('تعذر الاتصال بالخادم. يرجى المحاولة مرة أخرى.'); }
    finally { this.saving.set(false); }
  }

  async toggle(plan: PlatformPlan): Promise<void> {
    if (this.savingId()) return;
    this.savingId.set(plan.id);
    const response = await this.api.apiFetch(`/api/platform/plans/${plan.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !plan.isActive }) });
    if (response.ok) { this.notify('success', plan.isActive ? 'تم تعطيل الخطة.' : 'تم تفعيل الخطة.'); await this.load(); }
    else this.notify('error', await this.readError(response));
    this.savingId.set(null);
  }

  private async readError(response: Response): Promise<string> {
    try { const body = await response.json(); return body.error || 'تعذر تنفيذ العملية.'; } catch { return 'تعذر تنفيذ العملية.'; }
  }

  private notify(type: 'success' | 'error', text: string): void { this.toast.set({ type, text }); setTimeout(() => this.toast.set(null), 4000); }
}
