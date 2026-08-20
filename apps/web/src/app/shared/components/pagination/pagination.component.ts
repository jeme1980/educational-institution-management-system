import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-pagination',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './pagination.component.html',
  styleUrl: './pagination.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaginationComponent {
  page = input(1);
  pageSize = input(25);
  totalItems = input(0);
  totalPagesInput = input<number | null>(null);
  pageSizeOptions = input<number[]>([10, 25, 50, 100]);
  disabled = input(false);

  pageChange = output<number>();
  pageSizeChange = output<number>();

  totalPages = computed(() => this.totalPagesInput() ?? Math.max(1, Math.ceil(this.totalItems() / this.pageSize())));
  pages = computed(() => {
    const total = this.totalPages();
    const current = Math.min(Math.max(1, this.page()), total);
    const end = Math.min(total, Math.max(5, current + 2));
    const start = Math.max(1, Math.min(current - 2, end - 4));
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });
  rangeStart = computed(() => this.totalItems() === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1);
  rangeEnd = computed(() => Math.min(this.totalItems(), this.page() * this.pageSize()));

  goToPage(page: number): void {
    const safePage = Math.min(Math.max(1, page), this.totalPages());
    if (!this.disabled() && safePage !== this.page()) this.pageChange.emit(safePage);
  }

  onPageSizeChange(event: Event): void {
    const size = Number((event.target as HTMLSelectElement).value);
    if (!this.disabled() && Number.isFinite(size) && size > 0) this.pageSizeChange.emit(size);
  }
}
