import { Injectable, inject, signal } from '@angular/core';
import { AudioService } from '../audio/audio';

/**
 * How well it went.
 *
 * `congrats` is for finishing something (a page, a chapter, a quiz, a book),
 * `great` for doing it very well, `keep-going` for doing it well enough, and
 * `try-again` for falling short — said kindly, never as a telling-off.
 */
export type CheerTier = 'congrats' | 'great' | 'keep-going' | 'try-again';

export interface Cheer {
  /** Bumped per cheer, so the same words twice in a row still replay the pop. */
  id: number;
  tier: CheerTier;
  message: string;
  emoji: string;
}

const MESSAGES: Record<CheerTier, string[]> = {
  congrats: ['Congrats!', 'Congratulations!', 'You did it!'],
  great: ['Great job!', 'Awesome!', 'Super reading!', 'Fantastic!'],
  'keep-going': ['Keep up the good work!', 'Nice work — keep going!', 'Good reading!'],
  'try-again': ['Try again!', 'Almost there — try again!', "Don't give up — try again!"],
};

const EMOJI: Record<CheerTier, string[]> = {
  congrats: ['🏆', '🎉', '🥳'],
  great: ['🌟', '⭐', '🤩'],
  'keep-going': ['👍', '😊', '🙌'],
  'try-again': ['💪', '🙂', '🌈'],
};

/** Long enough to read and hear, short enough never to hold a child up. */
const SHOW_MS = 2200;

/**
 * The big "Great job!" that pops up when a child does something.
 *
 * One overlay in the student shell shows it, so every screen cheers the same
 * way. It never blocks a tap — it is drawn over the page, not in its way — and
 * it is spoken aloud too, since many of the children using this cannot yet read
 * the praise meant for them. The voice honours the sound switch.
 */
@Injectable({ providedIn: 'root' })
export class CheerService {
  private audio = inject(AudioService);

  readonly current = signal<Cheer | null>(null);

  private sequence = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** Cheer with one of the tier's messages, or the one given. */
  cheer(tier: CheerTier, message?: string): void {
    const text = message ?? this.pick(MESSAGES[tier]);

    this.current.set({ id: ++this.sequence, tier, message: text, emoji: this.pick(EMOJI[tier]) });
    this.say(text);

    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => this.dismiss(), SHOW_MS);
  }

  /**
   * Cheer a score out of 100: great at 85 and over, keep going at the pass
   * mark, try again below it.
   */
  forScore(score: number | null | undefined, passMark: number): void {
    const value = score ?? 0;

    if (value >= 85) {
      this.cheer('great');
    } else if (value >= passMark) {
      this.cheer('keep-going');
    } else {
      this.cheer('try-again');
    }
  }

  dismiss(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.current.set(null);
  }

  private say(text: string): void {
    if (this.audio.muted() || typeof speechSynthesis === 'undefined') {
      return;
    }

    try {
      const utterance = new SpeechSynthesisUtterance(text.replace('—', ','));
      utterance.lang = 'en-US';
      utterance.rate = 0.95;
      utterance.pitch = 1.25;
      // Queued, not cancelling: a word the child asked to hear finishes first.
      speechSynthesis.speak(utterance);
    } catch {
      /* no speech synthesis on this device */
    }
  }

  private pick<T>(options: T[]): T {
    return options[Math.floor(Math.random() * options.length)];
  }
}
