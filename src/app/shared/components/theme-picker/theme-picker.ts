import { Component, input, model } from '@angular/core';
import { THEMES, ThemeKey } from '../../../models/theme/theme.model';

/**
 * The theme samples a teacher picks from: each card is a small preview of the
 * world the pupils will read in.
 *
 *   <app-theme-picker [(value)]="form.theme" />
 *   <app-theme-picker [(value)]="form.theme" noneLabel="Same as the book" />
 */
@Component({
  selector: 'app-theme-picker',
  template: `
    <div class="picker" role="radiogroup" [attr.aria-label]="label()">
      <button
        type="button"
        role="radio"
        class="picker__card"
        [class.picker__card--on]="!value()"
        [attr.aria-checked]="!value()"
        (click)="value.set(null)">
        <span class="picker__sample picker__sample--none">
          <span class="picker__emoji">📖</span>
        </span>
        <span class="picker__name">{{ noneLabel() }}</span>
        <span class="picker__blurb">{{ noneBlurb() }}</span>
      </button>

      @for (theme of themes; track theme.key) {
        <button
          type="button"
          role="radio"
          class="picker__card"
          [class.picker__card--on]="value() === theme.key"
          [attr.aria-checked]="value() === theme.key"
          (click)="value.set(theme.key)">
          <span
            class="picker__sample"
            [style.background]="'linear-gradient(180deg, ' + theme.sky.join(', ') + ')'">
            @for (emoji of theme.scenery.slice(0, 3); track $index) {
              <span class="picker__emoji">{{ emoji }}</span>
            }
          </span>
          <span class="picker__name">{{ theme.name }}</span>
          <span class="picker__blurb">{{ theme.blurb }}</span>
        </button>
      }
    </div>
  `,
  styles: `
    .picker {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: var(--space-2, 0.5rem);
    }

    .picker__card {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 6px 6px 8px;
      border: 2px solid var(--color-border, #e6e8f2);
      border-radius: var(--radius-md, 12px);
      background: var(--color-surface, #fff);
      text-align: left;
      cursor: pointer;
      transition:
        border-color 0.15s ease,
        transform 0.15s ease;

      &:hover {
        transform: translateY(-2px);
      }

      &:focus-visible {
        outline: 3px solid var(--color-primary, #4f83e6);
        outline-offset: 2px;
      }

    }

    .picker__card--on {
      border-color: var(--color-primary, #4f83e6);
      box-shadow: 0 0 0 3px var(--color-primary-soft, #e9f1fe);
    }

    .picker__sample {
      display: flex;
      align-items: center;
      justify-content: space-around;
      height: 56px;
      border-radius: var(--radius-sm, 8px);
      margin-bottom: 4px;
    }

    .picker__sample--none {
      background: linear-gradient(180deg, #4a63d6, #59b7ec, #8fd3ff);
    }

    .picker__emoji {
      font-size: 1.4rem;
      line-height: 1;
    }

    .picker__name {
      font-weight: 700;
      font-size: var(--font-size-sm, 0.875rem);
      color: var(--color-text, #1f2333);
    }

    .picker__blurb {
      font-size: 0.75rem;
      line-height: 1.3;
      color: var(--color-text-muted, #6b7186);
    }
  `,
})
export class ThemePicker {
  readonly value = model<ThemeKey | null | undefined>(null);
  /** The first card, which picks no theme of its own. */
  readonly noneLabel = input('Classic');
  readonly noneBlurb = input('The usual blue sky');
  readonly label = input('Theme');

  readonly themes = THEMES;
}
