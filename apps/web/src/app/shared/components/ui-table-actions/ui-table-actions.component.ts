import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'ui-table-actions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<div class="ui-table-actions"><ng-content /></div>',
  styles: [`:host { display: inline-flex; align-items: center; vertical-align: middle; }
    .ui-table-actions { display: inline-flex; align-items: center; justify-content: center; flex-wrap: nowrap; gap: var(--space-1); white-space: nowrap; }`],
})
export class UiTableActionsComponent {}
