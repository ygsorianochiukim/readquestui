import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, DestroyRef, inject, input, output, signal } from '@angular/core';
import { AudioService } from '../../../services/audio/audio';
import { Icon } from '../icon/icon';

/** One page of the book: a scan, some words, or both. */
export interface FlipPage {
  id: number | string;
  imageUrl?: string | null;
  /** A chapter title printed above the words, on the page that opens it. */
  heading?: string | null;
  text?: string | null;
  /** Where this page's spoken audio comes from, when it can be read to the child. */
  narration?: { bookPageId: number; paragraphIndex: number } | null;
}

type Turn = { from: number; to: number; dir: 'next' | 'prev' };

/** Keep in step with the page-turn animation in the stylesheet. */
const TURN_MS = 700;
/** How far a finger must travel before a swipe counts as a page turn. */
const SWIPE_PX = 50;

/**
 * An open book whose pages really turn: the page swings over on its spine,
 * shaded as it goes, uncovering the next one underneath. Tap the arrows,
 * swipe, or use the arrow keys.
 *
 *   <app-flip-book [pages]="pages()" (pageChange)="onPage($event)" />
 */
@Component({
  selector: 'app-flip-book',
  imports: [Icon, NgTemplateOutlet],
  templateUrl: './flip-book.html',
  styleUrl: './flip-book.scss',
  host: {
    tabindex: '0',
    role: 'region',
    'aria-roledescription': 'book',
    '(keydown.arrowright)': 'next()',
    '(keydown.arrowleft)': 'previous()',
  },
})
export class FlipBook {
  private audio = inject(AudioService);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private swipeStart: number | null = null;

  readonly pages = input.required<FlipPage[]>();
  readonly alt = input('Page');

  /** Emits the page now open, counted from 0. */
  readonly pageChange = output<number>();

  readonly index = signal(0);
  readonly turn = signal<Turn | null>(null);

  readonly total = computed(() => this.pages().length);
  readonly isFirst = computed(() => this.index() === 0);
  readonly isLast = computed(() => this.index() >= this.total() - 1);

  /**
   * The page lying flat. While a page turns forward, the one underneath is the
   * page being turned to; turning back, the old page stays down and the new
   * one swings over on top of it.
   */
  readonly under = computed(() => {
    const turn = this.turn();
    const at = turn ? (turn.dir === 'next' ? turn.to : turn.from) : this.index();
    return this.pages()[at] ?? null;
  });

  /** The page in the air, or null when nothing is turning. */
  readonly leaf = computed(() => {
    const turn = this.turn();
    if (!turn) {
      return null;
    }
    return this.pages()[turn.dir === 'next' ? turn.from : turn.to] ?? null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timer && clearTimeout(this.timer));
  }

  next(): void {
    this.goTo(this.index() + 1, 'next');
  }

  previous(): void {
    this.goTo(this.index() - 1, 'prev');
  }

  onPointerDown(event: PointerEvent): void {
    this.swipeStart = event.clientX;
  }

  onPointerUp(event: PointerEvent): void {
    if (this.swipeStart === null) {
      return;
    }
    const moved = event.clientX - this.swipeStart;
    this.swipeStart = null;

    if (moved <= -SWIPE_PX) {
      this.next();
    } else if (moved >= SWIPE_PX) {
      this.previous();
    }
  }

  private goTo(to: number, dir: Turn['dir']): void {
    if (to < 0 || to >= this.total() || this.turn()) {
      return;
    }

    const from = this.index();
    this.index.set(to);
    this.pageChange.emit(to);
    this.audio.play('page-turn', 0.35);

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    this.turn.set({ from, to, dir });
    this.timer = setTimeout(() => {
      this.timer = null;
      this.turn.set(null);
    }, TURN_MS);
  }
}
