import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type UiBadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'disabled';
export type UiBadgeSize = 'sm' | 'md';
export type UiBadgeVariant = 'soft' | 'solid' | 'outline';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ui-badge',
  standalone: true,
  template: `
    <span
      class="ui-badge"
      [class]="'ui-badge ui-badge--' + tone() + ' ui-badge--' + size() + ' ui-badge--' + variant()"
      role="status">
      <ng-content />
    </span>
  `,
  styles: [`
    :host { display: inline-flex; }
    .ui-badge {
      display: inline-flex;
      min-height: var(--space-6);
      align-items: center;
      gap: var(--space-1);
      border: 1px solid transparent;
      border-radius: var(--radius-full);
      font-size: var(--font-xs);
      font-weight: var(--font-semibold);
      line-height: 1.25;
      white-space: nowrap;
    }
    .ui-badge--sm { padding-block: var(--space-1); padding-inline: var(--space-2); }
    .ui-badge--md { min-height: var(--space-8); padding-block: var(--space-1); padding-inline: var(--space-3); font-size: var(--font-sm); }

    .ui-badge--soft.ui-badge--success { background: var(--success-container); color: var(--success); }
    .ui-badge--soft.ui-badge--warning { background: var(--warning-container); color: var(--warning); }
    .ui-badge--soft.ui-badge--danger { background: var(--danger-container); color: var(--danger); }
    .ui-badge--soft.ui-badge--info { background: var(--info-container); color: var(--info); }
    .ui-badge--soft.ui-badge--neutral { background: var(--neutral-container); color: var(--neutral); }
    .ui-badge--soft.ui-badge--disabled { background: var(--disabled-surface); color: var(--disabled-text); }

    .ui-badge--solid.ui-badge--success { background: var(--success); color: var(--on-primary); }
    .ui-badge--solid.ui-badge--warning { background: var(--warning); color: var(--on-primary); }
    .ui-badge--solid.ui-badge--danger { background: var(--danger); color: var(--on-primary); }
    .ui-badge--solid.ui-badge--info { background: var(--info); color: var(--on-primary); }
    .ui-badge--solid.ui-badge--neutral { background: var(--neutral); color: var(--on-primary); }
    .ui-badge--solid.ui-badge--disabled { background: var(--disabled-surface); color: var(--disabled-text); }

    .ui-badge--outline { background: transparent; }
    .ui-badge--outline.ui-badge--success { border-color: var(--success); color: var(--success); }
    .ui-badge--outline.ui-badge--warning { border-color: var(--warning); color: var(--warning); }
    .ui-badge--outline.ui-badge--danger { border-color: var(--danger); color: var(--danger); }
    .ui-badge--outline.ui-badge--info { border-color: var(--info); color: var(--info); }
    .ui-badge--outline.ui-badge--neutral { border-color: var(--outline); color: var(--neutral); }
    .ui-badge--outline.ui-badge--disabled { border-color: var(--outline-variant); color: var(--disabled-text); }
  `],
})
export class UiBadgeComponent {
  readonly tone = input<UiBadgeTone>('neutral');
  readonly size = input<UiBadgeSize>('sm');
  readonly variant = input<UiBadgeVariant>('soft');
}
