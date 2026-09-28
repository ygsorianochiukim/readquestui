import { Component, computed, inject, input, output, effect } from '@angular/core';
import { Celebrations, PronunciationAttempt, ReadingPace } from '../../../models';
import { LiveWord } from '../../../services/live-reading/word-alignment';
import { AudioService } from '../../../services/audio/audio';
import { Button } from '../button/button';
import { Icon } from '../icon/icon';
import { ProgressBar } from '../progress-bar/progress-bar';

interface Dimension {
  label: string;
  value: number | null;
  hint: string;
}

/**
 * What the child sees the moment a reading is scored: how they did, what they
 * missed, and anything they just earned.
 *
 * Deliberately loud about success and quiet about failure — "Let's try that
 * page again" and a list of two or three words to practise, never a red cross
 * and a number.
 */
@Component({
  selector: 'app-score-modal',
  imports: [Button, Icon, ProgressBar],
  templateUrl: './score-modal.html',
  styleUrl: './score-modal.scss',
})
export class ScoreModal {
  private audio = inject(AudioService);

  readonly open = input(false);
  readonly attempt = input<PronunciationAttempt | null>(null);
  readonly celebrations = input<Celebrations | null>(null);
  readonly passMark = input(60);
  readonly paceHint = input<string | null>(null);
  /** The forward button's words, e.g. "Next page" when reading a chapter page by page. */
  readonly nextLabel = input('Keep going');
  /** Offer the forward button after a low score too — one page does not decide a chapter. */
  readonly alwaysNext = input(false);
  /** The words as the live reader left them — the practice list comes from here. */
  readonly words = input<LiveWord[]>([]);

  readonly retry = output<void>();
  readonly next = output<void>();
  readonly closed = output<void>();

  readonly score = computed(() => {
    const value = this.attempt()?.effective_score ?? this.attempt()?.pron_score;

    return value === null || value === undefined ? null : Math.round(value);
  });

  readonly passed = computed(() => this.attempt()?.passed ?? false);

  /** The headline. Nothing about a score a child cannot read. */
  readonly headline = computed(() => {
    const attempt = this.attempt();

    if (!attempt) {
      return '';
    }

    if (attempt.is_off_script) {
      return "Let's read this page";
    }

    if (!this.passed()) {
      return 'Good try!';
    }

    // Finishing something bigger than the page outranks the score: a child who
    // scraped a pass on the last chapter of a book has still finished the book.
    const milestone = this.celebrations()?.milestone;

    if (milestone === 'book_completed' || milestone === 'chapter_completed') {
      return 'Congratulations!';
    }

    const score = this.score() ?? 0;

    return score >= 95 ? 'Perfect reading!' : score >= 85 ? 'Great reading!' : 'Well done!';
  });

  /** One line of advice, picked for the thing that actually went wrong. */
  readonly advice = computed(() => {
    const attempt = this.attempt();

    if (!attempt) {
      return null;
    }

    if (attempt.is_off_script) {
      return 'Read the words on the page out loud, and we will listen again.';
    }

    if ((attempt.text_match_score ?? 100) < this.passMark()) {
      return 'You read part of the page. Try reading all of it this time.';
    }

    if (this.paceHint()) {
      return this.paceHint();
    }

    if (!this.passed()) {
      return 'Practise the words below, then read the page again.';
    }

    return null;
  });

  /** The words worth practising — the few that went wrong, not all of them. */
  readonly practiceWords = computed(() =>
    this.words()
      .filter((word) => word.state === 'incorrect' || word.state === 'omitted')
      .slice(0, 8),
  );

  readonly dimensions = computed<Dimension[]>(() => {
    const attempt = this.attempt();

    if (!attempt) {
      return [];
    }

    return [
      { label: 'Saying the words', value: attempt.accuracy_score, hint: 'accuracy' },
      { label: 'Reading smoothly', value: attempt.fluency_score, hint: 'fluency' },
      { label: 'Reading it all', value: attempt.completeness_score, hint: 'completeness' },
      { label: 'Reading with feeling', value: attempt.prosody_score, hint: 'intonation' },
      // Diction: how cleanly each sound of each word came out.
      { label: 'Speaking clearly', value: attempt.diction_score, hint: 'diction' },
    ].filter((dimension) => dimension.value !== null);
  });

  readonly rewards = computed(() => {
    const celebrations = this.celebrations();

    return [...(celebrations?.badges ?? []), ...(celebrations?.achievements ?? [])];
  });

  readonly milestoneLabel = computed(() => {
    switch (this.celebrations()?.milestone) {
      case 'book_completed':
        return 'You finished the whole book!';
      case 'chapter_completed':
        return 'Chapter complete!';
      case 'page_completed':
        return 'Page complete!';
      default:
        return null;
    }
  });

  constructor() {
    // The sound belongs to the moment the result lands, not to whoever
    // happened to call the API.
    effect(() => {
      if (!this.open() || !this.attempt()) {
        return;
      }

      if (this.rewards().length > 0 || this.celebrations()?.milestone === 'book_completed') {
        this.audio.play('celebrate');
      } else {
        this.audio.playResult(this.passed());
      }
    });
  }

  describePace(pace: ReadingPace | null): string | null {
    switch (pace) {
      case 'too_slow':
        return 'A little slow';
      case 'too_fast':
        return 'A little fast';
      case 'good':
        return 'Just right';
      default:
        return null;
    }
  }

  /** Colour band for the score ring. */
  tone(): 'great' | 'good' | 'try' {
    const score = this.score();

    if (score === null) {
      return 'try';
    }

    return score >= 90 ? 'great' : score >= this.passMark() ? 'good' : 'try';
  }
}
