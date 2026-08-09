import { Component, computed, input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { APP_ICONS, IconName } from './icons';

/**
 * Renders one of the app's Lucide icons by name.
 *
 *   <app-icon name="book" />
 *   <app-icon name="trophy" size="lg" />
 *
 * Unknown names render nothing rather than throwing, so data-driven icons
 * (a badge whose icon was renamed, say) degrade quietly.
 */
@Component({
  selector: 'app-icon',
  imports: [LucideAngularModule],
  template: `
    @if (icon(); as resolved) {
      <lucide-icon
        [img]="resolved"
        [size]="pixels()"
        [strokeWidth]="strokeWidth()"
        [attr.aria-hidden]="label() ? null : true"
        [attr.aria-label]="label() || null"
        [attr.role]="label() ? 'img' : null" />
    }
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 0;
        color: inherit;
        flex-shrink: 0;
      }
    `,
  ],
})
export class Icon {
  readonly name = input.required<IconName | string>();
  /** sm 16px · md 20px · lg 24px · xl 32px · 2xl 44px */
  readonly size = input<'sm' | 'md' | 'lg' | 'xl' | '2xl'>('md');
  readonly strokeWidth = input<number>(2);
  /** Set when the icon carries meaning on its own; otherwise it is decorative. */
  readonly label = input<string>('');

  readonly icon = computed(() => APP_ICONS[this.name() as IconName] ?? null);

  readonly pixels = computed(
    () => ({ sm: 16, md: 20, lg: 24, xl: 32, '2xl': 44 })[this.size()],
  );
}
