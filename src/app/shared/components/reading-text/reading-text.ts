import { Component, computed, input, output } from '@angular/core';
import { LiveWord } from '../../../services/live-reading/word-alignment';
import { Icon } from '../icon/icon';

/**
 * The passage a child reads, with every word carrying its own verdict.
 *
 * This is the thing the change request asks for first: the word turns green as
 * they get it right and red when they do not, while they are still reading.
 * Tapping a red word asks for it again.
 */
@Component({
  selector: 'app-reading-text',
  imports: [Icon],
  templateUrl: './reading-text.html',
  styleUrl: './reading-text.scss',
})
export class ReadingText {
  readonly words = input.required<LiveWord[]>();
  /** Off while the child is reading — nothing should move under their finger. */
  readonly interactive = input(false);
  readonly size = input<'normal' | 'large'>('large');

  /** The child tapped a word they want to try again. */
  readonly retryWord = output<LiveWord>();

  readonly hasResults = computed(() =>
    this.words().some((word) => word.state !== 'pending' && word.state !== 'current'),
  );

  /** A word can only be retried once it has actually gone wrong. */
  canRetry(word: LiveWord): boolean {
    return (
      this.interactive() &&
      word.normalized !== '' &&
      (word.state === 'incorrect' || word.state === 'omitted')
    );
  }

  /** What a screen reader should say about a word's state. */
  label(word: LiveWord): string {
    switch (word.state) {
      case 'correct':
        return `${word.text}: correct`;
      case 'incorrect':
        return `${word.text}: try again`;
      case 'omitted':
        return `${word.text}: skipped`;
      case 'current':
        return `${word.text}: read this now`;
      default:
        return word.text;
    }
  }
}
