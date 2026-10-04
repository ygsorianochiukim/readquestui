import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { AudioService } from '../../../services/audio/audio';
import { NarrationService } from '../../../services/narration/narration';
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
  private audio = inject(AudioService);
  private narration = inject(NarrationService);

  /** Sentences taken from the chapter's story by the parent. */
  readonly sentences = input<string[]>([]);
  readonly alreadyDone = input<boolean>(false);

  /** Emits how many mistakes the child made on the way, for the no-mistakes bonus. */
  readonly completed = output<number>();

  readonly index = signal(0);
  readonly built = signal<string[]>([]);
  readonly checked = signal(false);
  readonly finished = signal(false);
  /** Wrong checks this round; a clean run earns the bonus. */
  readonly mistakes = signal(0);

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

  readonly speechAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;

  place(word: string): void {
    if (this.checked() && this.isCorrect()) {
      return;
    }
    this.built.update((words) => [...words, word]);
    this.checked.set(false);
    // Each word is said as it is placed, so the child hears the sentence
    // assembling rather than only seeing it.
    this.speak(word);
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

    const correct = this.isCorrect();
    this.audio.playResult(correct);

    if (!correct) {
      this.mistakes.update((count) => count + 1);
    }

    if (correct) {
      // Reading the finished sentence back is the reward, and the reading.
      this.speak(this.built().join(' '));
    }
  }

  /** Hear the sentence as it stands, to work out what is still out of place. */
  hearBuilt(): void {
    const built = this.built();

    if (built.length) {
      this.speak(built.join(' '));
    }
  }

  private speak(text: string): void {
    // The narration voice, not the browser's robotic one.
    void this.narration.say(text, 0.85);
  }

  /** Build the sentences again from the start — for fun, once it has been won. */
  restart(): void {
    this.index.set(0);
    this.reset();
    this.mistakes.set(0);
    this.finished.set(false);
  }

  next(): void {
    if (this.index() < this.total() - 1) {
      this.index.update((value) => value + 1);
      this.reset();
    } else {
      this.finished.set(true);
      this.completed.emit(this.mistakes());
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
