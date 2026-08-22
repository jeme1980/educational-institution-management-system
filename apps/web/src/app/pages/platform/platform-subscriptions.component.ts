import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { UiBadgeComponent, UiBadgeTone } from '../../shared/components/ui-badge/ui-badge.component';
import { UiButtonComponent } from '../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../shared/components/input/ui-input.component';
import { UiSelectComponent } from '../../shared/components/select/ui-select.component';
import { UiTableActionsComponent } from '../../shared/components/ui-table-actions/ui-table-actions.component';

type SubscriptionFilter = 'all' | 'ACTIVE' | 'TRIAL' | 'PAST_DUE' | 'SUSPENDED' | 'EXPIRED' | 'NO_SUBSCRIPTION';

@Component({
  selector: 'app-platform-subscriptions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatIconModule, RouterLink, UiBadgeComponent, UiButtonComponent, UiInputComponent, UiSelectComponent, UiTableActionsComponent],
  template: `
    <section dir="rtl" class="space-y-4" aria-labelledby="platform-subscriptions-title">
      <header><h2 id="platform-subscriptions-title" class="text-xl font-bold text-on-surface">اشتراكات المؤسسات</h2><p class="mt-1 text-sm text-on-surface-variant">عرض الحالة الحالية وإدارة اشتراك كل مؤسسة.</p></header>
      <div class="grid gap-3 rounded-md border border-surface-border bg-surface p-4 md:grid-cols-[1fr_14rem]">
        <ui-input ariaLabel="البحث في اشتراكات المؤسسات" placeholder="ابحث باسم المؤسسة أو الرمز أو الخطة" (input)="setSearch($event)" />
        <ui-select ariaLabel="تصفية حالة الاشتراك" [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event)"><option value="all">كل الحالات</option><option value="ACTIVE">نشط</option><option value="TRIAL">تجريبي</option><option value="PAST_DUE">متأخر</option><option value="SUSPENDED">موقوف</option><option value="EXPIRED">منتهٍ</option><option value="NO_SUBSCRIPTION">بلا اشتراك</option></ui-select>
      </div>
      @if (loading()) { <div class="rounded-md border border-surface-border bg-surface p-8 text-center text-on-surface-variant">جارٍ تحميل الاشتراكات...</div> }
      @else { <div class="overflow-x-auto rounded-md border border-surface-border bg-surface"><table class="w-full min-w-[980px] text-right text-sm"><thead class="bg-surface-container-low text-on-surface-variant"><tr><th class="h-10 px-4">المؤسسة</th><th class="h-10 px-4">الخطة</th><th class="h-10 px-4">حالة الاشتراك</th><th class="h-10 px-4">حد الطلاب</th><th class="h-10 px-4">الاستخدام الحالي</th><th class="h-10 px-4">تاريخ البداية</th><th class="h-10 px-4">تاريخ الانتهاء</th><th class="h-10 px-4 text-center">الإجراءات</th></tr></thead><tbody>@for (item of filteredRows(); track item.id) {<tr class="h-[52px] border-t border-surface-border"><td class="px-4"><strong class="block text-on-surface">{{ item.nameAr }}</strong><small class="font-mono text-on-surface-variant">{{ item.schoolCode }}</small></td><td class="px-4 text-on-surface-variant">{{ item.plan?.nameAr || item.subscription?.plan?.nameAr || 'بلا خطة' }}</td><td class="px-4"><ui-badge [tone]="statusTone(item)">{{ statusLabel(item) }}</ui-badge></td><td class="px-4">{{ item.plan?.maxStudents ?? item.subscription?.plan?.maxStudents ?? 'غير محدود' }}</td><td class="px-4">{{ usageLabel(item) }}</td><td class="px-4">{{ item.subscription?.startsAt ? (item.subscription.startsAt | date:'mediumDate') : '—' }}</td><td class="px-4">{{ item.subscription?.endsAt ? (item.subscription.endsAt | date:'mediumDate') : '—' }}</td><td class="px-4 text-center"><ui-table-actions><ui-button size="sm" [iconOnly]="true" variant="ghost" [routerLink]="['/platform/institutions']" [queryParams]="{ manage: item.id }" [ariaLabel]="'إدارة اشتراك ' + item.nameAr" title="إدارة الاشتراك"><mat-icon aria-hidden="true">credit_card</mat-icon></ui-button></ui-table-actions></td></tr>} @empty {<tr><td colspan="8" class="p-8 text-center text-on-surface-variant">لا توجد مؤسسات مطابقة.</td></tr>}</tbody></table></div> }
    </section>
  `,
  styles: [':host { display: block; }'],
})
export class PlatformSubscriptionsComponent {
  private readonly api = inject(ApiService);
  readonly rows = signal<any[]>([]);
  readonly loading = signal(false);
  readonly search = signal('');
  readonly statusFilter = signal<SubscriptionFilter>('all');
  readonly filteredRows = computed(() => {
    const query = this.search().trim().toLocaleLowerCase('ar');
    const filter = this.statusFilter();
    return this.rows().filter((item) => {
      const haystack = [item.nameAr, item.schoolCode, item.plan?.nameAr, item.subscription?.plan?.nameAr].map((value) => String(value || '').toLocaleLowerCase('ar'));
      const matchesSearch = !query || haystack.some((value) => value.includes(query));
      const matchesStatus = filter === 'all' || this.statusCode(item) === filter;
      return matchesSearch && matchesStatus;
    });
  });

  constructor() { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    const response = await this.api.apiFetch('/api/platform/institutions?scope=all');
    if (response.ok) this.rows.set(await response.json());
    this.loading.set(false);
  }

  setSearch(event: Event): void { this.search.set((event.target as HTMLInputElement).value); }
  statusCode(item: any): SubscriptionFilter { return item.subscription?.status || 'NO_SUBSCRIPTION'; }
  statusLabel(item: any): string { return ({ ACTIVE: 'نشط', TRIAL: 'تجريبي', PAST_DUE: 'متأخر', SUSPENDED: 'موقوف', EXPIRED: 'منتهٍ', CANCELED: 'ملغى', NO_SUBSCRIPTION: 'بلا اشتراك' } as Record<string, string>)[this.statusCode(item)] || 'غير معروف'; }
  statusTone(item: any): UiBadgeTone { return ({ ACTIVE: 'success', TRIAL: 'info', PAST_DUE: 'warning', SUSPENDED: 'danger', EXPIRED: 'neutral', CANCELED: 'neutral', NO_SUBSCRIPTION: 'disabled' } as Record<string, UiBadgeTone>)[this.statusCode(item)] || 'neutral'; }
  usageLabel(item: any): string { const usage = item.subscriptionState?.usage?.students; return usage === undefined ? 'غير متاح' : String(usage); }
}
