import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';

@Component({ changeDetection: ChangeDetectionStrategy.OnPush, standalone: true, imports: [MatIconModule, RouterLink, RouterLinkActive, RouterOutlet], templateUrl: './platform-shell.component.html', styleUrl: './platform-shell.component.css' })
export class PlatformShellComponent {
  readonly auth = inject(AuthService); readonly theme = inject(ThemeService);
}
