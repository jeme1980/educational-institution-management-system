import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { UiStatCardComponent } from '../../../shared/components/ui-stat-card/ui-stat-card.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-student-metrics',
  imports: [MatIconModule, UiStatCardComponent],
  templateUrl: './student-metrics.html',
})
export class StudentMetrics {
  totalCount = input<number>(0);
  activeCount = input<number>(0);
  filteredCount = input<number>(0);
  guardiansCount = input<number>(0);
}
