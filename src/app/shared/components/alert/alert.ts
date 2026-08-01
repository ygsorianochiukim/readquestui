import { Component, input } from '@angular/core';

export type AlertVariant = 'error' | 'success' | 'info';

@Component({
  selector: 'app-alert',
  templateUrl: './alert.html',
  styleUrl: './alert.scss',
})
export class Alert {
  readonly message = input<string | null>(null);
  readonly variant = input<AlertVariant>('error');

  readonly icon: Record<AlertVariant, string> = {
    error: '⚠️',
    success: '✅',
    info: 'ℹ️',
  };
}
