import { Injectable, signal } from '@angular/core';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'default';
}

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  readonly activeDialog = signal<ConfirmDialogOptions | null>(null);

  private resolver: ((value: boolean) => void) | null = null;

  confirm(options: ConfirmDialogOptions): Promise<boolean> {
    this.resolve(false);
    this.activeDialog.set(options);

    return new Promise<boolean>((resolve) => {
      this.resolver = resolve;
    });
  }

  resolve(value: boolean): void {
    const resolver = this.resolver;
    this.resolver = null;
    this.activeDialog.set(null);
    resolver?.(value);
  }
}
