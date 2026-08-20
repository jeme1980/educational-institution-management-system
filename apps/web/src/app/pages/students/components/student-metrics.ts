import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-student-metrics',
  imports: [MatIconModule],
  templateUrl: './student-metrics.html',
})
export class StudentMetrics {
  totalCount = input<number>(0);
  activeCount = input<number>(0);
  filteredCount = input<number>(0);
  guardiansCount = input<number>(0);
}
