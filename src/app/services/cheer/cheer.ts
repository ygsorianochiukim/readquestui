import { Injectable, inject, signal } from '@angular/core';
import { AudioService, SoundName } from '../audio/audio';
import { ConfettiKind, ConfettiService } from '../confetti/confetti';

/**
 * How well it went.
 *
 * `congrats` is for finishing something (a page, a chapter, a quiz, a book),
 * `great` for doing it very well, `keep-going` for doing it well enough, and
 * `try-again` for falling short — said kindly, never as a telling-off.
 */
export type CheerTier = 'congrats' | 'great' | 'keep-going' | 'try-again';

/** What else happens with a cheer: a sound effect, and confetti. */
export interface CheerEffects {
  sound?: SoundName;
  confetti?: ConfettiKind[];
}

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

/** Long enough to read, short enough never to hold a child up. */
const SHOW_MS = 2200;

/**
 * The big "Great job!" that pops up when a child does something.
 *
 * One overlay in the student shell shows it, so every screen cheers the same
 * way. It never blocks a tap — it is drawn over the page, not in its way.
 *
 * It is not read aloud: the browser's synthetic voice sounded robotic and
 * unsettling to children, mid-quiz especially. The emoji, the sound effects and
 * the confetti carry the praise for a child who cannot read it yet.
 */
@Injectable({ providedIn: 'root' })
export class CheerService {
  private audio = inject(AudioService);
  private confetti = inject(ConfettiService);

  readonly current = signal<Cheer | null>(null);

  private sequence = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Cheer with one of the tier's messages, or the one given — with a sound
   * effect and confetti when the moment calls for them.
   */
  cheer(tier: CheerTier, message?: string, effects: CheerEffects = {}): void {
    const text = message ?? this.pick(MESSAGES[tier]);

    this.current.set({ id: ++this.sequence, tier, message: text, emoji: this.pick(EMOJI[tier]) });

    if (effects.sound) {
      this.audio.play(effects.sound, 0.7);
    }
    for (const kind of effects.confetti ?? []) {
      this.confetti.fire(kind);
    }
    if (effects.confetti?.includes('sides')) {
      // The poppers go off with a bang of their own.
      this.audio.play('party-popper', 0.5);
    }

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
      // "Fantastic!" — with confetti cannons at both sides of the screen.
      this.cheer('great', undefined, { confetti: ['sides'] });
    } else if (value >= passMark) {
      this.cheer('keep-going', undefined, { confetti: ['drop'] });
    } else {
      this.cheer('try-again', undefined, { sound: 'reading-wrong' });
    }
  }

  dismiss(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.current.set(null);
  }

  private pick<T>(options: T[]): T {
    return options[Math.floor(Math.random() * options.length)];
  }
}
