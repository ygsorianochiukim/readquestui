import { Component, computed, input } from '@angular/core';
import { Icon } from '../icon/icon';
import { IconName } from '../icon/icons';

export type AlertVariant = 'error' | 'success' | 'info';

@Component({
  selector: 'app-alert',
  imports: [Icon],
  templateUrl: './alert.html',
  styleUrl: './alert.scss',
})
export class Alert {
  readonly message = input<string | null>(null);
  readonly variant = input<AlertVariant>('error');

  private readonly icons: Record<AlertVariant, IconName> = {
    error: 'alert',
    success: 'check-circle',
    info: 'info',
  };

  readonly icon = computed(() => this.icons[this.variant()]);
}
