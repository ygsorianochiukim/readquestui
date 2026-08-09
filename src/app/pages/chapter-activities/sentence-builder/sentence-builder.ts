import { Component, computed, effect, input, output, signal } from '@angular/core';
import { Button, Icon } from '../../../shared/components';

/**
 * A sentence-order game: the words of a sentence from the story are shuffled,
 * and the player taps them back into the right order.
 */
@Component({
  selector: 'app-sentence-builder',
  imports: [Button, Icon],
  templateUrl: './sentence-builder.html',
  styleUrl: './sentence-builder.scss',
})
export class SentenceBuilder {
  /** Sentences taken from the chapter's story by the parent. */
  readonly sentences = input<string[]>([]);
  readonly alreadyDone = input<boolean>(false);

  readonly completed = output<void>();

  readonly index = signal(0);
  readonly built = signal<string[]>([]);
  readonly checked = signal(false);
  readonly finished = signal(false);

  /** Up to three short-enough sentences make a round each. */
  readonly rounds = computed(() =>
    this.sentences()
      .map((sentence) => sentence.trim().split(/\s+/).filter(Boolean))
      .filter((words) => words.length >= 4 && words.length <= 9)
      .slice(0, 3),
  );

  readonly total = computed(() => this.rounds().length);
  readonly answer = computed(() => this.rounds()[this.index()] ?? []);
  readonly pool = computed(() => this.shuffleStable(this.answer(), this.index()));

  /** Words still waiting to be placed, in pool order. */
  readonly remaining = computed(() => {
    const used = [...this.built()];
    return this.pool().filter((word) => {
      const position = used.indexOf(word);
      if (position === -1) {
        return true;
      }
      used.splice(position, 1);
      return false;
    });
  });

  readonly isCorrect = computed(
    () => this.built().join(' ') === this.answer().join(' '),
  );

  constructor() {
    effect(() => {
      if (this.alreadyDone()) {
        this.finished.set(true);
      }
    });
  }

  place(word: string): void {
    if (this.checked() && this.isCorrect()) {
      return;
    }
    this.built.update((words) => [...words, word]);
    this.checked.set(false);
  }

  undo(): void {
    this.built.update((words) => words.slice(0, -1));
    this.checked.set(false);
  }

  reset(): void {
    this.built.set([]);
    this.checked.set(false);
  }

  check(): void {
    this.checked.set(true);
  }

  next(): void {
    if (this.index() < this.total() - 1) {
      this.index.update((value) => value + 1);
      this.reset();
    } else {
      this.finished.set(true);
      this.completed.emit();
    }
  }

  /**
   * Shuffle deterministically from the round index, so the tiles keep their
   * order while the player works on the sentence.
   */
  private shuffleStable(words: string[], seed: number): string[] {
    const copy = [...words];
    let random = seed * 9301 + 49297;

    for (let position = copy.length - 1; position > 0; position--) {
      random = (random * 9301 + 49297) % 233280;
      const target = Math.floor((random / 233280) * (position + 1));
      [copy[position], copy[target]] = [copy[target], copy[position]];
    }

    // A shuffle that changes nothing would give the answer away.
    if (copy.join(' ') === words.join(' ') && copy.length > 1) {
      [copy[0], copy[copy.length - 1]] = [copy[copy.length - 1], copy[0]];
    }

    return copy;
  }
}
