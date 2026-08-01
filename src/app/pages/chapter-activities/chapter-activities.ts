import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { ProgressService } from '../../services/progress/progress';
import { ReaderService } from '../../services/reader/reader';
import { NarrationService } from '../../services/narration/narration';
import { RecorderService } from '../../services/recorder/recorder';
import { PronunciationService } from '../../services/pronunciation/pronunciation';
import {
  ChapterNode,
  ChapterProgress,
  PronunciationAttempt,
  StudentQuizQuestion,
} from '../../models';
import { Alert, Button, Spinner } from '../../shared/components';
import { WordScramble } from './word-scramble/word-scramble';

type StepKey = 'story' | 'readaloud' | 'game' | 'quiz';

@Component({
  selector: 'app-chapter-activities',
  imports: [Alert, Button, Spinner, WordScramble],
  templateUrl: './chapter-activities.html',
  styleUrl: './chapter-activities.scss',
})
export class ChapterActivities implements OnInit, OnDestroy {
  private progressService = inject(ProgressService);
  private readerService = inject(ReaderService);
  private narrationService = inject(NarrationService);
  private recorder = inject(RecorderService);
  private pronunciationService = inject(PronunciationService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly bookId = Number(this.route.snapshot.paramMap.get('bookId'));
  readonly chapterId = Number(this.route.snapshot.paramMap.get('chapterId'));

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly title = signal('');
  readonly chapterNumber = signal(0);
  readonly storyText = signal<string | null>(null);
  readonly imageUrl = signal<string | null>(null);

  // Progress flags for this chapter.
  readonly storyRead = signal(false);
  readonly pronunciationPassed = signal(false);
  readonly gameCompleted = signal(false);
  readonly quizPassed = signal(false);
  readonly completed = signal(false);

  readonly activeStep = signal<StepKey>('story');

  readonly steps = computed(() => [
    { key: 'story' as const, label: 'Story', icon: '📖', done: this.storyRead() },
    { key: 'readaloud' as const, label: 'Read Aloud', icon: '🎤', done: this.pronunciationPassed() },
    { key: 'game' as const, label: 'Game', icon: '🎮', done: this.gameCompleted() },
    { key: 'quiz' as const, label: 'Quiz', icon: '🧠', done: this.quizPassed() },
  ]);

  readonly gameWords = computed(() => this.pickWords(this.storyText() ?? ''));

  // Narration
  readonly narrating = signal(false);
  readonly narrationLoading = signal(false);
  private audio: HTMLAudioElement | null = null;

  // Read-aloud
  readonly recordingState = signal<'idle' | 'recording' | 'assessing'>('idle');
  readonly result = signal<PronunciationAttempt | null>(null);

  // Quiz
  readonly quizQuestions = signal<StudentQuizQuestion[]>([]);
  readonly answers = signal<Record<number, string>>({});
  readonly quizResult = signal<{ score: number; correct: number; total: number; passed: boolean } | null>(null);

  ngOnInit(): void {
    forkJoin({
      reader: this.readerService.book(this.bookId),
      progress: this.progressService.book(this.bookId),
      quiz: this.progressService.quiz(this.chapterId),
    }).subscribe({
      next: ({ reader, progress, quiz }) => {
        const chapter = (reader.data.chapters ?? []).find((entry) => entry.id === this.chapterId);
        const node = progress.data.chapters.find((entry) => entry.id === this.chapterId);

        if (node?.is_locked) {
          this.router.navigate(['/student/books', this.bookId]);
          return;
        }

        this.title.set(chapter?.title ?? node?.title ?? 'Chapter');
        this.chapterNumber.set(chapter?.chapter_number ?? node?.chapter_number ?? 0);
        this.storyText.set(chapter?.story_text ?? null);
        this.imageUrl.set(chapter?.image_url ?? null);
        this.applyProgress(node?.progress ?? null);
        this.quizQuestions.set(quiz.data);
        this.loading.set(false);
      },
      error: (response: HttpErrorResponse) => {
        this.errorMessage.set(response.error?.message ?? 'Could not open this chapter.');
        this.loading.set(false);
      },
    });
  }

  ngOnDestroy(): void {
    this.stopNarration();
  }

  private applyProgress(progress: ChapterProgress | null): void {
    this.storyRead.set(progress?.story_read ?? false);
    this.pronunciationPassed.set(progress?.pronunciation_passed ?? false);
    this.gameCompleted.set(progress?.game_completed ?? false);
    this.quizPassed.set(progress?.quiz_passed ?? false);
    this.completed.set(progress?.status === 'completed');
  }

  go(step: StepKey): void {
    this.stopNarration();
    this.activeStep.set(step);
  }

  // ---- Story ----
  markStoryRead(): void {
    this.progressService.markStoryRead(this.chapterId).subscribe({
      next: (response) => {
        this.applyProgress(response.data);
        this.go('readaloud');
      },
    });
  }

  toggleNarration(): void {
    if (this.narrating()) {
      this.stopNarration();
      return;
    }
    const text = this.storyText();
    if (!text) {
      this.errorMessage.set('This chapter has no text to read aloud yet.');
      return;
    }

    this.errorMessage.set(null);
    this.narrating.set(true);
    this.narrationLoading.set(true);

    this.narrationService.getNarration(this.chapterId).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        this.audio = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          this.narrating.set(false);
        };
        audio.play();
        this.narrationLoading.set(false);
      },
      error: (response: HttpErrorResponse) => {
        this.narrating.set(false);
        this.narrationLoading.set(false);
        this.errorMessage.set(this.narrationError(response.status));
      },
    });
  }

  stopNarration(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
    this.narrating.set(false);
  }

  // ---- Read aloud (pronunciation) ----
  async toggleRecording(): Promise<void> {
    if (!this.storyText()) {
      this.errorMessage.set('There is no text to read on this chapter.');
      return;
    }

    if (this.recordingState() === 'recording') {
      this.recordingState.set('assessing');
      try {
        const audio = await this.recorder.stop();
        this.pronunciationService.assess(audio, { chapterId: this.chapterId }).subscribe({
          next: (response) => {
            this.result.set(response.data);
            if ((response.data.pron_score ?? 0) >= 60) {
              this.pronunciationPassed.set(true);
            }
            this.recordingState.set('idle');
          },
          error: (response: HttpErrorResponse) => {
            this.recordingState.set('idle');
            this.errorMessage.set(this.assessError(response.status));
          },
        });
      } catch {
        this.recordingState.set('idle');
        this.errorMessage.set('Could not process the recording. Please try again.');
      }
      return;
    }

    this.errorMessage.set(null);
    this.result.set(null);
    this.stopNarration();
    try {
      await this.recorder.start();
      this.recordingState.set('recording');
    } catch {
      this.errorMessage.set('Please allow microphone access to record your reading.');
    }
  }

  scoreTone(score: number | null): string {
    if (score === null) {
      return 'try';
    }
    if (score >= 90) {
      return 'great';
    }
    if (score >= 70) {
      return 'good';
    }
    return 'try';
  }

  // ---- Game ----
  onGameCompleted(): void {
    this.progressService.completeGame(this.chapterId).subscribe({
      next: (response) => this.applyProgress(response.data),
    });
  }

  // ---- Quiz ----
  choose(questionId: number, choice: string): void {
    this.answers.update((current) => ({ ...current, [questionId]: choice }));
  }

  isChosen(questionId: number, choice: string): boolean {
    return this.answers()[questionId] === choice;
  }

  submitQuiz(): void {
    this.progressService.submitQuiz(this.chapterId, this.answers()).subscribe({
      next: (response) => {
        const result = response.data;
        this.quizResult.set({
          score: result.score,
          correct: result.correct,
          total: result.total,
          passed: result.passed,
        });
        this.applyProgress(result.progress);
      },
    });
  }

  retryQuiz(): void {
    this.answers.set({});
    this.quizResult.set(null);
  }

  finish(): void {
    this.router.navigate(['/student/books', this.bookId]);
  }

  /** Choose up to five distinct words (4–8 letters) from the story for the game. */
  private pickWords(text: string): string[] {
    const seen = new Set<string>();
    const words: string[] = [];
    for (const raw of text.split(/[^A-Za-z]+/)) {
      const word = raw.toLowerCase();
      if (word.length >= 4 && word.length <= 8 && !seen.has(word)) {
        seen.add(word);
        words.push(word);
      }
      if (words.length >= 5) {
        break;
      }
    }
    if (words.length === 0) {
      return ['read', 'story', 'quest', 'learn', 'books'];
    }
    return words;
  }

  private assessError(status: number): string {
    switch (status) {
      case 503:
        return 'Read-aloud scoring is not set up yet. Ask your teacher to add the Azure Speech key.';
      case 422:
        return 'There is no text to check your reading against.';
      default:
        return 'Could not score your reading. Please try reading again.';
    }
  }

  private narrationError(status: number): string {
    switch (status) {
      case 503:
        return 'Read-aloud is not set up yet. Ask your teacher to add the Azure Speech key.';
      case 422:
        return 'This chapter has no text to read aloud yet.';
      default:
        return 'Could not read this chapter aloud. Please try again.';
    }
  }
}
