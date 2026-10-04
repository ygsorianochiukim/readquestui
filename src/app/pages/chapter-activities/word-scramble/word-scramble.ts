import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AudioService } from '../../../services/audio/audio';
import { NarrationService } from '../../../services/narration/narration';
import { Button, Icon, StatusIndicator } from '../../../shared/components';

/** A word to unscramble, and the sentence it came from to help place it. */
export interface WordChallenge {
  word: string;
  /** The word's own sentence with a blank where it belongs. Null when unknown. */
  clue: string | null;
}

/**
 * A small vocabulary game: the player unscrambles words drawn from the
 * chapter's story. Finishing every word completes the activity.
 *
 * Every word comes with somewhere to stand — its sentence from the story, with
 * the word blanked out — and can be heard or read aloud, so a child who cannot
 * yet spell it still has a way through.
 */
@Component({
  selector: 'app-word-scramble',
  imports: [FormsModule, Button, Icon, StatusIndicator],
  templateUrl: './word-scramble.html',
  styleUrl: './word-scramble.scss',
})
export class WordScramble {
  private audio = inject(AudioService);
  private narration = inject(NarrationService);

  /** Words to unscramble (already chosen by the parent from the story). */
  readonly challenges = input<WordChallenge[]>([]);
  readonly alreadyDone = input<boolean>(false);

  /** Emits how many mistakes the child made on the way, for the no-mistakes bonus. */
  readonly completed = output<number>();

  readonly index = signal(0);
  readonly guess = signal('');
  readonly feedback = signal<'idle' | 'correct' | 'wrong'>('idle');
  readonly finished = signal(false);
  /** Revealed one at a time, so a stuck child is helped rather than told. */
  readonly lettersRevealed = signal(0);
  readonly listening = signal(false);
  /** Wrong typed guesses this round; a clean run earns the bonus. */
  readonly mistakes = signal(0);

  readonly currentChallenge = computed(() => this.challenges()[this.index()] ?? null);
  readonly current = computed(() => this.currentChallenge()?.word ?? '');
  readonly clue = computed(() => this.currentChallenge()?.clue ?? null);
  readonly total = computed(() => this.challenges().length);

  /**
   * The scramble for the current word.
   *
   * Seeded off the word and the attempt count rather than re-rolled on every
   * change detection — otherwise the tiles reshuffle under the child's finger
   * every time they type a letter.
   */
  readonly scrambled = computed(() => this.scramble(this.current()));

  /** The opening letters, revealed one press at a time. */
  readonly revealed = computed(() => this.current().slice(0, this.lettersRevealed()));

  readonly canRevealMore = computed(
    () => this.lettersRevealed() < Math.max(1, this.current().length - 1),
  );

  /** Speaking the answer is only a hint once the child has had a go. */
  readonly speechAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;

  constructor() {
    // If the chapter game was already completed before, reflect that.
    effect(() => {
      if (this.alreadyDone()) {
        this.finished.set(true);
      }
    });
  }

  check(): void {
    const correct = this.guess().trim().toLowerCase() === this.current().toLowerCase();

    this.feedback.set(correct ? 'correct' : 'wrong');
    this.audio.playResult(correct);

    if (!correct) {
      this.mistakes.update((count) => count + 1);
    }
  }

  /** Play the words again from the start — for fun, once it has been won. */
  restart(): void {
    this.index.set(0);
    this.guess.set('');
    this.feedback.set('idle');
    this.lettersRevealed.set(0);
    this.mistakes.set(0);
    this.finished.set(false);
  }

  nextWord(): void {
    if (this.index() < this.total() - 1) {
      this.index.update((value) => value + 1);
      this.guess.set('');
      this.feedback.set('idle');
      this.lettersRevealed.set(0);
    } else {
      this.finished.set(true);
      this.completed.emit(this.mistakes());
    }
  }

  /** Give away one more opening letter. */
  revealLetter(): void {
    if (this.canRevealMore()) {
      this.lettersRevealed.update((count) => count + 1);
      this.audio.play('tap', 0.3);
    }
  }

  /** Say the answer, so the child can hear the word they are building. */
  hearWord(): void {
    this.speak(this.current());
  }

  /** Read the clue sentence out, for a child who cannot read it yet. */
  hearClue(): void {
    const clue = this.clue();

    if (clue) {
      this.speak(clue.replace('_____', 'blank'));
    }
  }

  /**
   * Answer by saying the word instead of typing it.
   *
   * Uses the browser's own recogniser rather than the Azure pipeline: this is
   * one short word with a known answer, it is not scored or stored, and it has
   * to come back instantly.
   */
  answerAloud(): void {
    const Recognition =
      (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

    if (!Recognition) {
      return;
    }

    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;

    this.listening.set(true);

    recognition.onresult = (event: any) => {
      const heard: string[] = Array.from(event.results[0] ?? []).map((alternative: any) =>
        String(alternative.transcript).trim().toLowerCase(),
      );

      // Any of the recogniser's guesses matching counts: a six-year-old's
      // "fox" is not always the recogniser's first choice.
      const correct = heard.some((option) => option === this.current().toLowerCase());

      if (correct) {
        this.guess.set(this.current());
      }

      this.feedback.set(correct ? 'correct' : 'wrong');
      this.audio.playResult(correct);
      this.listening.set(false);
    };

    recognition.onerror = () => this.listening.set(false);
    recognition.onend = () => this.listening.set(false);

    try {
      recognition.start();
    } catch {
      this.listening.set(false);
    }
  }

  readonly speechInputAvailable =
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition);

  private speak(text: string): void {
    // The narration voice, not the browser's robotic one.
    void this.narration.say(text, 0.8);
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
