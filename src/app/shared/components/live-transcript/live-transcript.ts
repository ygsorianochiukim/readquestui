import { Component, ElementRef, afterRenderEffect, computed, input, viewChild } from '@angular/core';

/**
 * What the recogniser has heard so far, shown while the child reads.
 *
 * Settled words in full, and the phrase still being worked out after them in
 * a lighter italic — so the child can see their reading arrive, and see it
 * firm up, without mistaking a half-heard guess for the final word. Plain
 * string inputs, not the live-reading service, so any screen that listens can
 * show it.
 */
@Component({
  selector: 'app-live-transcript',
  templateUrl: './live-transcript.html',
  styleUrl: './live-transcript.scss',
})
export class LiveTranscript {
  /** Everything settled on so far. */
  readonly transcript = input('');
  /** The phrase being heard right now, not yet settled. */
  readonly partial = input('');
  readonly heading = input('What I heard');

  readonly isEmpty = computed(() => !this.transcript().trim() && !this.partial().trim());

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  constructor() {
    // Keep the newest words in view: a long page soon outgrows the box, and
    // the child is only ever interested in what they just said.
    afterRenderEffect(() => {
      this.transcript();
      this.partial();

      const element = this.scroller()?.nativeElement;
      if (element) {
        element.scrollTop = element.scrollHeight;
      }
    });
  }
}
