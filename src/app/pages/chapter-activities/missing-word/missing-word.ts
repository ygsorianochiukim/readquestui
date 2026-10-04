import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { AudioService } from '../../../services/audio/audio';
import { NarrationService } from '../../../services/narration/narration';
import { Button, Icon } from '../../../shared/components';

interface Round {
  /** The sentence with the target word replaced by a blank. */
  masked: string;
  answer: string;
  choices: string[];
}

/**
 * A comprehension game: a sentence from the story appears with one word hidden,
 * and the player picks the word that belongs there.
 */
@Component({
  selector: 'app-missing-word',
  imports: [Button, Icon],
  templateUrl: './missing-word.html',
  styleUrl: './missing-word.scss',
})
export class MissingWord {
  private audio = inject(AudioService);
  private narration = inject(NarrationService);

  /** Sentences taken from the chapter's story by the parent. */
  readonly sentences = input<string[]>([]);
  readonly alreadyDone = input<boolean>(false);

  /** Emits how many mistakes the child made on the way, for the no-mistakes bonus. */
  readonly completed = output<number>();

  readonly index = signal(0);
  readonly picked = signal<string | null>(null);
  readonly finished = signal(false);
  readonly correctCount = signal(0);
  /** Wrong picks this round; a clean run earns the bonus. */
  readonly mistakes = signal(0);

  readonly rounds = computed(() => this.buildRounds(this.sentences()));
  readonly total = computed(() => this.rounds().length);
  readonly current = computed(() => this.rounds()[this.index()] ?? null);

  readonly isCorrect = computed(() => {
    const picked = this.picked();
    return picked !== null && picked === this.current()?.answer;
  });

  constructor() {
    effect(() => {
      if (this.alreadyDone()) {
        this.finished.set(true);
      }
    });
  }

  readonly speechAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;

  pick(choice: string): void {
    if (this.picked() && this.isCorrect()) {
      return; // already solved this round
    }

    const correct = choice === this.current()?.answer;

    this.picked.set(choice);
    this.audio.playResult(correct);

    if (!correct) {
      this.mistakes.update((value) => value + 1);
    }

    if (correct) {
      this.correctCount.update((value) => value + 1);
      // Hearing the finished sentence is the point of the game — it turns a
      // multiple-choice tap back into reading.
      this.speak(this.current()!.masked.replace('______', choice));
    }
  }

  /** Read the sentence out, blank and all, for a child who cannot read it yet. */
  hearSentence(): void {
    const round = this.current();

    if (round) {
      this.speak(round.masked.replace('______', 'blank'));
    }
  }

  /** Say one of the choices, so a child can hear the word before picking it. */
  hearChoice(choice: string, event: Event): void {
    event.stopPropagation();
    this.speak(choice);
  }

  private speak(text: string): void {
    // The narration voice, not the browser's robotic one.
    void this.narration.say(text, 0.85);
  }

  /** Play the sentences again from the start — for fun, once it has been won. */
  restart(): void {
    this.index.set(0);
    this.picked.set(null);
    this.correctCount.set(0);
    this.mistakes.set(0);
    this.finished.set(false);
  }

  next(): void {
    if (this.index() < this.total() - 1) {
      this.index.update((value) => value + 1);
      this.picked.set(null);
    } else {
      this.finished.set(true);
      this.completed.emit(this.mistakes());
    }
  }

  /** Build up to four rounds: a sentence, its hidden word, and four choices. */
  private buildRounds(sentences: string[]): Round[] {
    const usable = sentences.filter((sentence) => this.wordsOf(sentence).length >= 4);
    const pool = this.distinctWords(sentences);
    const rounds: Round[] = [];

    for (const sentence of usable.slice(0, 4)) {
      const words = this.wordsOf(sentence);
      // Hide the longest word — it carries the most meaning.
      const answer = [...words].sort((first, second) => second.length - first.length)[0];
      const distractors = pool
        .filter((word) => word.toLowerCase() !== answer.toLowerCase())
        .slice(0, 3);

      if (distractors.length < 3) {
        continue;
      }

      rounds.push({
        masked: sentence.replace(new RegExp(`\\b${answer}\\b`), '______'),
        answer,
        choices: this.shuffle([answer, ...distractors]),
      });
    }

    return rounds;
  }

  private wordsOf(sentence: string): string[] {
    return sentence.split(/[^A-Za-z]+/).filter((word) => word.length >= 4);
  }

  /** Distinct 4–9 letter words across all sentences, used as wrong choices. */
  private distinctWords(sentences: string[]): string[] {
    const seen = new Set<string>();
    const words: string[] = [];

    for (const word of sentences.join(' ').split(/[^A-Za-z]+/)) {
      const key = word.toLowerCase();
      if (word.length >= 4 && word.length <= 9 && !seen.has(key)) {
        seen.add(key);
        words.push(word.toLowerCase());
      }
    }

    return words;
  }

  private shuffle(values: string[]): string[] {
    const copy = [...values];
    for (let position = copy.length - 1; position > 0; position--) {
      const target = Math.floor(Math.random() * (position + 1));
      [copy[position], copy[target]] = [copy[target], copy[position]];
    }
    return copy;
  }
}
