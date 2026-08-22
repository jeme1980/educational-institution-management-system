import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'ui-table-actions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<div class="ui-table-actions"><ng-content /></div>',
  styles: [`.ui-table-actions { display: inline-flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: var(--space-1); }`],
})
export class UiTableActionsComponent {}
