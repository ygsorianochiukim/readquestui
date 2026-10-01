import { Component, inject } from '@angular/core';
import { CheerService } from '../../../services/cheer/cheer';

/** Confetti pieces around the bubble: across, delay and colour. */
const CONFETTI = Array.from({ length: 18 }, (_, index) => ({
  x: (index * 37) % 100,
  delay: (index % 6) * 60,
  colour: ['#ff4d8d', '#ffc83d', '#52dd8c', '#4f83e6', '#ff9e63', '#b77fe3'][index % 6],
}));

/**
 * The "Great job!" pop-up. Mounted once in the student shell; screens ask for
 * a cheer through CheerService. It ignores the pointer entirely, so it can
 * never stand between a child and the next button.
 */
@Component({
  selector: 'app-cheer',
  template: `
    @if (current(); as cheer) {
      @for (shown of [cheer]; track shown.id) {
        <div class="cheer cheer--{{ shown.tier }}" role="status" aria-live="polite">
          @if (shown.tier !== 'try-again') {
            <div class="cheer__confetti" aria-hidden="true">
              @for (piece of confetti; track $index) {
                <span
                  class="cheer__piece"
                  [style.left.%]="piece.x"
                  [style.animation-delay.ms]="piece.delay"
                  [style.background]="piece.colour"></span>
              }
            </div>
          }
          <div class="cheer__bubble">
            <span class="cheer__emoji" aria-hidden="true">{{ shown.emoji }}</span>
            <p class="cheer__message">{{ shown.message }}</p>
          </div>
        </div>
      }
    }
  `,
  styleUrl: './cheer.scss',
})
export class CheerOverlay {
  readonly current = inject(CheerService).current;
  readonly confetti = CONFETTI;
}
