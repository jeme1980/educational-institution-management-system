import { Directive, Input, TemplateRef, ViewContainerRef, inject, effect } from '@angular/core';
import { AuthService } from '../services/auth.service';

@Directive({
  selector: '[appHasPermission]',
  standalone: true
})
export class HasPermissionDirective {
  private templateRef = inject(TemplateRef<any>);
  private viewContainer = inject(ViewContainerRef);
  private authService = inject(AuthService);

  private permissionCodeValue = '';
  private hasView = false;

  @Input() set hasPermission(permissionCode: string) {
    this.permissionCodeValue = permissionCode;
    this.updateView();
  }

  constructor() {
    // Run inside effect to re-run automatically when currentContext signal updates
    effect(() => {
      this.authService.currentContext();
      this.updateView();
    });
  }

  private updateView() {
    const hasPerm = this.authService.hasPermission(this.permissionCodeValue);

    if (hasPerm && !this.hasView) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
    } else if (!hasPerm && this.hasView) {
      this.viewContainer.clear();
      this.hasView = false;
    }
  }
}
