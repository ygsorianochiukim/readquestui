import { Component, computed, input } from '@angular/core';
import { ReadingTheme } from '../../../models/theme/theme.model';

/** Where each piece of scenery sits (percent across, percent down) and how big. */
const SPOTS = [
  { x: 6, y: 14, size: 2.6 },
  { x: 86, y: 10, size: 3.2 },
  { x: 18, y: 46, size: 2.2 },
  { x: 92, y: 40, size: 2.4 },
  { x: 4, y: 76, size: 3 },
  { x: 78, y: 70, size: 2.6 },
  { x: 46, y: 90, size: 2.2 },
  { x: 60, y: 24, size: 1.8 },
  { x: 32, y: 8, size: 1.8 },
  { x: 70, y: 52, size: 1.6 },
];

/**
 * The drifting things behind a themed world — palm leaves in the jungle,
 * ghosts at Halloween. Purely decoration: hidden from screen readers, never
 * in the way of a tap, and still when the device asks for less motion.
 */
@Component({
  selector: 'app-theme-scenery',
  template: `
    @if (theme(); as current) {
      <div class="scenery" aria-hidden="true">
        @for (piece of pieces(); track $index) {
          <span
            class="scenery__piece"
            [style.left.%]="piece.x"
            [style.top.%]="piece.y"
            [style.font-size.rem]="piece.size"
            [style.animation-delay.s]="piece.delay"
            [style.animation-duration.s]="piece.duration">{{ piece.emoji }}</span>
        }
      </div>
    }
  `,
  styles: `
    .scenery {
      position: fixed;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      overflow: hidden;
    }

    .scenery__piece {
      position: absolute;
      line-height: 1;
      opacity: 0.55;
      filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.15));
      animation: scenery-drift ease-in-out infinite alternate;
    }

    @keyframes scenery-drift {
      from {
        transform: translate(0, 0) rotate(-8deg);
      }
      to {
        transform: translate(12px, -22px) rotate(8deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .scenery__piece {
        animation: none;
      }
    }
  `,
})
export class ThemeScenery {
  readonly theme = input<ReadingTheme | null>(null);

  readonly pieces = computed(() => {
    const scenery = this.theme()?.scenery ?? [];

    return scenery.length === 0
      ? []
      : SPOTS.map((spot, index) => ({
          ...spot,
          emoji: scenery[index % scenery.length],
          delay: -(index * 0.9),
          duration: 5 + (index % 4),
        }));
  });
}
