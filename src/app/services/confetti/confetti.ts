import { Injectable, signal } from '@angular/core';

/**
 * `sides`: party poppers firing up and inwards from both bottom corners.
 * `drop`: a soft shower of confetti falling from the top of the screen.
 */
export type ConfettiKind = 'sides' | 'drop';

export interface ConfettiBurst {
  /** Bumped per burst, so the overlay knows a new one has started. */
  id: number;
  kind: ConfettiKind;
}

/** Screens ask for confetti here; one overlay in the student shell draws it. */
@Injectable({ providedIn: 'root' })
export class ConfettiService {
  readonly burst = signal<ConfettiBurst | null>(null);

  private sequence = 0;

  fire(kind: ConfettiKind): void {
    this.burst.set({ id: ++this.sequence, kind });
  }
}
