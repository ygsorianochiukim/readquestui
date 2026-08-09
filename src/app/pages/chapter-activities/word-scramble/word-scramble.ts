import { Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button, Icon } from '../../../shared/components';

/**
 * A small vocabulary game: the player unscrambles words drawn from the
 * chapter's story. Finishing every word completes the activity.
 */
@Component({
  selector: 'app-word-scramble',
  imports: [FormsModule, Button, Icon],
  templateUrl: './word-scramble.html',
  styleUrl: './word-scramble.scss',
})
export class WordScramble {
  /** Words to unscramble (already chosen by the parent from the story). */
  readonly words = input<string[]>([]);
  readonly alreadyDone = input<boolean>(false);

  readonly completed = output<void>();

  readonly index = signal(0);
  readonly guess = signal('');
  readonly feedback = signal<'idle' | 'correct' | 'wrong'>('idle');
  readonly finished = signal(false);

  readonly current = computed(() => this.words()[this.index()] ?? '');
  readonly scrambled = computed(() => this.scramble(this.current()));
  readonly total = computed(() => this.words().length);

  constructor() {
    // If the chapter game was already completed before, reflect that.
    effect(() => {
      if (this.alreadyDone()) {
        this.finished.set(true);
      }
    });
  }

  check(): void {
    if (this.guess().trim().toLowerCase() === this.current().toLowerCase()) {
      this.feedback.set('correct');
    } else {
      this.feedback.set('wrong');
    }
  }

  nextWord(): void {
    if (this.index() < this.total() - 1) {
      this.index.update((value) => value + 1);
      this.guess.set('');
      this.feedback.set('idle');
    } else {
      this.finished.set(true);
      this.completed.emit();
    }
  }

  /** Shuffle a word's letters (retries so it differs from the original). */
  private scramble(word: string): string {
    if (word.length < 2) {
      return word;
    }
    for (let attempt = 0; attempt < 8; attempt++) {
      const letters = word.split('');
      for (let i = letters.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [letters[i], letters[j]] = [letters[j], letters[i]];
      }
      const result = letters.join('');
      if (result.toLowerCase() !== word.toLowerCase()) {
        return result;
      }
    }
    return word.split('').reverse().join('');
  }
}
