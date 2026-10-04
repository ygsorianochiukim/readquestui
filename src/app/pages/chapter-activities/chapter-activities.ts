import { Component, computed, effect, inject, OnDestroy, OnInit, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, forkJoin, of, Subscription } from 'rxjs';
import { ProgressService } from '../../services/progress/progress';
import { ReaderService } from '../../services/reader/reader';
import { NarrationService } from '../../services/narration/narration';
import { RecorderService } from '../../services/recorder/recorder';
import { LiveReadingService } from '../../services/live-reading/live-reading';
import { LiveWord } from '../../services/live-reading/word-alignment';
import { AudioService } from '../../services/audio/audio';
import { CelebrationService } from '../../services/celebration/celebration';
import { CheerService } from '../../services/cheer/cheer';
import { ThemeService } from '../../services/theme/theme';
import { PronunciationService } from '../../services/pronunciation/pronunciation';
import { ReadingPlaceService } from '../../services/reading-place/reading-place';
import {
  BookPage,
  ReadAloudSummary,
  Celebrations,
  ChapterNode,
  ChapterProgress,
  PronunciationAttempt,
  QuizReviewItem,
  StudentQuizQuestion,
} from '../../models';
import { GameType, GameWinRecord } from '../../models/progress/progress.model';
import {
  Alert,
  Button,
  Icon,
  LevelMap,
  LevelStop,
  LevelStopPick,
  LiveTranscript,
  ReadingText,
  ScoreModal,
  Spinner,
  StatusIndicator,
  StickerIcon,
} from '../../shared/components';
import { WordScramble, WordChallenge } from './word-scramble/word-scramble';
import { MissingWord } from './missing-word/missing-word';
import { SentenceBuilder } from './sentence-builder/sentence-builder';

/**
 * A chapter's story is read a page at a time — picked from the chapter's own
 * page map, listened to, and read aloud — and then played and quizzed on as a
 * whole: Read story, Game, Quiz.
 */
type StepKey = 'pages' | 'game' | 'quiz';

/** One of the three mini-games every chapter offers. */
type GameKind = GameType;

/** A tile in the game picker. */
interface GameOption {
  kind: GameKind;
  title: string;
  icon: string;
  /** The first win on this chapter, if there has been one. */
  win: GameWinRecord | null;
}

/** An answer the child just picked, and the verdict on it. */
interface QuizFeedback {
  picked: string;
  /** Null when the check could not be reached — the answer still counts. */
  correct: boolean | null;
  correctAnswer: string | null;
  message: string;
}

/** A chapter's heading line, e.g. "Chapter 2" or "Chapter 2: The River". */
const CHAPTER_HEADING = /^chapter\s+[\w-]+\b.{0,60}$/i;

/**
 * One page of the chapter as the child sees it — the same page the teacher
 * sees — read, heard and scored on its own. A whole chapter at once is too
 * much for a young reader; a page at a time is not.
 */
interface ReadingPage {
  key: string;
  bookPageId: number;
  /** Its place on its page, counted the way the server counts it. */
  paragraphIndex: number;
  text: string;
  /** The scan's picture(s), shown on the first page cut from that scan. */
  images: string[];
  /** A "Chapter 2" line from the top of the scan, shown above its first page. */
  heading: string | null;
}

const PRAISE = ['Great job!', 'You got it!', 'Super reading!', 'Well done!', 'That is right!'];
const ENCOURAGE = [
  'Not quite — good try!',
  'Almost! Look at the right answer.',
  'Nice try — you will get the next one!',
];

@Component({
  selector: 'app-chapter-activities',
  imports: [
    Alert,
    Button,
    LevelMap,
    Spinner,
    WordScramble,
    MissingWord,
    SentenceBuilder,
    Icon,
    LiveTranscript,
    ReadingText,
    ScoreModal,
    StatusIndicator,
    StickerIcon,
  ],
  templateUrl: './chapter-activities.html',
  styleUrl: './chapter-activities.scss',
})
export class ChapterActivities implements OnInit, OnDestroy {
  private progressService = inject(ProgressService);
  private readerService = inject(ReaderService);
  private narrationService = inject(NarrationService);
  private recorder = inject(RecorderService);
  private live = inject(LiveReadingService);
  private audioCues = inject(AudioService);
  private celebrationService = inject(CelebrationService);
  private cheers = inject(CheerService);
  private themes = inject(ThemeService);
  /** The reading theme, so the map is painted in it too. */
  readonly theme = this.themes.active;
  private pronunciationService = inject(PronunciationService);
  private places = inject(ReadingPlaceService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly bookId = Number(this.route.snapshot.paramMap.get('bookId'));
  readonly chapterId = Number(this.route.snapshot.paramMap.get('chapterId'));

  /** Matches ProgressService::PRONUNCIATION_PASS on the API. */
  readonly passMark = 60;

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly title = signal('');
  private bookTitle = '';
  readonly chapterNumber = signal(0);
  readonly storyText = signal<string | null>(null);
  readonly imageUrl = signal<string | null>(null);

  // Progress flags for this chapter.
  readonly storyRead = signal(false);
  readonly pronunciationPassed = signal(false);
  readonly gameCompleted = signal(false);
  readonly quizPassed = signal(false);
  readonly completed = signal(false);

  readonly activeStep = signal<StepKey>('pages');

  readonly steps = computed(() => [
    {
      key: 'pages' as const,
      label: 'Read story',
      icon: 'book',
      done: this.storyRead() && this.pronunciationPassed(),
    },
    { key: 'game' as const, label: 'Game', icon: 'game', done: this.gameCompleted() },
    { key: 'quiz' as const, label: 'Quiz', icon: 'quiz', done: this.quizPassed() },
  ]);

  readonly gameWords = computed(() => this.pickWords(this.storyText() ?? ''));
  readonly gameSentences = computed(() => this.pickSentences(this.storyText() ?? ''));

  /**
   * The scramble game's words with the sentence each came from, so a child who
   * is stuck gets a clue from the story rather than a blank stare. Unscrambling
   * "hfsoer" with no context is a puzzle; unscrambling it under "The ___ ran
   * across the field" is reading.
   */
  readonly wordChallenges = computed<WordChallenge[]>(() =>
    this.gameWords().map((word) => ({
      word,
      clue: this.clueFor(word, this.storyText() ?? ''),
    })),
  );

  /** Mini-games already won on this chapter, with the points each paid. */
  readonly gameWins = signal<GameWinRecord[]>([]);

  /**
   * The game the child picked. Until they pick, chapters still take turns
   * suggesting a different one first, so a book does not open on the same
   * game every time.
   */
  private readonly pickedGame = signal<GameKind | null>(null);

  readonly gameKind = computed<GameKind>(() => {
    const picked = this.pickedGame();
    if (picked) {
      return picked;
    }

    const kinds: GameKind[] = ['scramble', 'missing-word', 'sentence-builder'];
    const number = this.chapterNumber();
    return kinds[(Math.max(1, number) - 1) % kinds.length];
  });

  /** Every game is playable; any one completes the step, the rest are bonus rounds. */
  readonly gameOptions = computed<GameOption[]>(() => {
    const wins = this.gameWins();
    const options: Array<Omit<GameOption, 'win'>> = [
      { kind: 'scramble', title: 'Word scramble', icon: 'shapes' },
      { kind: 'missing-word', title: 'Missing word', icon: 'story' },
      { kind: 'sentence-builder', title: 'Build the sentence', icon: 'layers' },
    ];

    return options.map((option) => ({
      ...option,
      win: wins.find((win) => win.game_type === option.kind) ?? null,
    }));
  });

  readonly gameTitle = computed(
    () => this.gameOptions().find((option) => option.kind === this.gameKind())?.title ?? 'Game',
  );

  /** Whether the game on screen has been won before (it opens on its done screen). */
  readonly currentGameWon = computed(() =>
    this.gameWins().some((win) => win.game_type === this.gameKind()),
  );

  readonly gamePointsTotal = computed(() =>
    this.gameWins().reduce((sum, win) => sum + win.points_awarded, 0),
  );

  /** What the last finished game earned, said under the game. */
  readonly gameMessage = signal<string | null>(null);

  // Narration
  readonly narrating = signal(false);
  readonly narrationLoading = signal(false);
  private audio: HTMLAudioElement | null = null;
  /** Bumped whenever narration stops or moves page, so a late answer is ignored. */
  private narrationRun = 0;

  // The chapter's pages: picked from the page map, then read one at a time.
  readonly readingPages = signal<ReadingPage[]>([]);
  readonly readIndex = signal(0);
  /** Whether a page is open, or the page map is showing. */
  readonly pageOpen = signal(false);
  /** Page scores have loaded, so the page map knows which pages are open. */
  readonly scoresLoaded = signal(false);
  private queryParams: Subscription | null = null;
  /** Best score so far on each page, keyed `pageId:paragraph`; null until read. */
  readonly pageScores = signal<Record<string, number | null>>({});
  readonly readAloudSummary = signal<ReadAloudSummary | null>(null);

  /** Chapters with pages are read aloud a page at a time; others in one go. */
  readonly readByPage = computed(() => this.readingPages().length > 0);
  /** What the child is reading, in the words the feedback uses. */
  readonly readNoun = computed(() => (this.readByPage() ? 'page' : 'story'));
  readonly currentReadPage = computed(() => this.readingPages()[this.readIndex()] ?? null);
  readonly isLastReadPage = computed(() => this.readIndex() >= this.readingPages().length - 1);

  /** The first page not read aloud yet; past the end once every page has been. */
  readonly firstUnread = computed(() => {
    const scores = this.pageScores();
    const index = this.readingPages().findIndex((page) => scores[page.key] == null);

    return index < 0 ? this.readingPages().length : index;
  });

  /** The next page is open once this one has been read. */
  readonly canTurnNext = computed(
    () => !this.isLastReadPage() && this.readIndex() + 1 <= this.firstUnread(),
  );

  readonly allPagesRead = computed(
    () => this.readingPages().length > 0 && this.firstUnread() >= this.readingPages().length,
  );

  /**
   * The chapter's pages as stops on its own level map — the same map as the
   * books and chapters, one step further in. Pages open in order: every page
   * read so far, and the next one.
   */
  readonly pageStops = computed<LevelStop[]>(() => {
    const next = this.firstUnread();

    return this.readingPages().map((page, index) => {
      const score = this.scoreOf(page);
      const look =
        score !== null ? 'completed' : index === next ? 'current' : index < next ? 'available' : 'locked';

      return {
        id: index + 1,
        number: index + 1,
        title: `Page ${index + 1}`,
        look,
        meta: score !== null ? `Best score ${score}` : look === 'current' ? 'Up next' : undefined,
        label:
          `Page ${index + 1}` +
          (score !== null ? `, best score ${score}` : look === 'locked' ? ', locked' : ', not read yet'),
      };
    });
  });

  /** The words being read aloud right now: this page's, or the whole story's. */
  readonly readText = computed(() =>
    this.readByPage() ? (this.currentReadPage()?.text ?? null) : this.storyText(),
  );

  readonly recordingState = signal<'idle' | 'connecting' | 'recording' | 'assessing' | 'retrying'>(
    'idle',
  );
  readonly result = signal<PronunciationAttempt | null>(null);
  readonly celebrations = signal<Celebrations | null>(null);
  readonly showScore = signal(false);
  readonly paceHint = signal<string | null>(null);
  readonly retryTarget = signal<LiveWord | null>(null);
  readonly liveAvailable = signal(true);

  /** The story, word by word, coloured as the child reads it. */
  readonly words = this.live.words;
  readonly partialTranscript = this.live.partial;
  readonly liveTranscript = this.live.transcript;
  readonly liveMeters = this.live.meters;
  readonly livePace = this.live.pace;
  readonly liveWpm = this.live.wordsPerMinute;
  readonly liveProgress = this.live.score;

  readonly isBusy = computed(() =>
    ['connecting', 'assessing', 'retrying'].includes(this.recordingState()),
  );

  /**
   * Why the last read-aloud fell short, in words a pupil can act on. Reading
   * the wrong words, reading only some of them, and reading them unclearly all
   * need different advice — "read a little slower" helps none of the first two.
   */
  readonly readAloudFeedback = computed(() => {
    const attempt = this.result();
    if (!attempt) {
      return '';
    }

    const matched = Math.round(attempt.text_match_score ?? 0);

    if (attempt.is_off_script) {
      return (
        `That did not match the ${this.readNoun()} — only ${matched}% of the words matched. ` +
        `Read the words on the ${this.readNoun()} out loud and try again.`
      );
    }
    if (matched < this.passMark) {
      return (
        `You read part of the ${this.readNoun()} — ${matched}% of the words. ` +
        `Read the whole ${this.readNoun()} out loud and try again.`
      );
    }
    // Pace advice only when pace was actually the problem — "read a little
    // slower" is unhelpful to a child who was already too slow.
    const pace = this.paceHint();

    if (this.readByPage()) {
      return (
        `You scored ${Math.round(attempt.effective_score ?? 0)} on this page — ` +
        `${pace ?? 'practise the red words'}, or read it again. Your pages need to average ` +
        `${this.passMark} to finish this step.`
      );
    }

    return (
      `You scored ${Math.round(attempt.effective_score ?? 0)}. You need ${this.passMark} to ` +
      `finish this step — ${pace ?? 'practise the red words and try again'}.`
    );
  });

  // Quiz
  readonly quizQuestions = signal<StudentQuizQuestion[]>([]);
  readonly answers = signal<Record<number, string>>({});
  readonly quizResult = signal<{
    score: number;
    correct: number;
    total: number;
    passed: boolean;
    review: QuizReviewItem[];
  } | null>(null);

  /** The quiz goes one question at a time, so each answer gets its own verdict. */
  readonly quizIndex = signal(0);
  readonly quizFeedback = signal<QuizFeedback | null>(null);
  readonly quizChecking = signal(false);
  readonly quizSubmitting = signal(false);

  readonly currentQuestion = computed(() => this.quizQuestions()[this.quizIndex()] ?? null);
  readonly isLastQuestion = computed(() => this.quizIndex() >= this.quizQuestions().length - 1);

  /** The book's level, so the live pace meter uses the right words-a-minute band. */
  private readonly readingLevel = signal<string | null>(null);

  constructor() {
    // The background music plays on through the chapter, but not into the
    // microphone: a tune under the recording muddies the score.
    effect(() => {
      const micOpen = ['connecting', 'recording'].includes(this.recordingState());
      if (micOpen) {
        this.audioCues.duckForRecording();
      } else {
        this.audioCues.restoreAfterRecording();
      }
    });

    // Stop and score on its own once the last word is read, so the child does
    // not have to find the button. A short grace lets the final word's audio in.
    effect(() => {
      const done =
        this.recordingState() === 'recording' &&
        this.liveAvailable() &&
        !this.retryTarget() &&
        this.live.reachedEnd();

      untracked(() => {
        if (!done || this.autoStopTimer) {
          return;
        }
        this.autoStopTimer = setTimeout(() => {
          this.autoStopTimer = null;
          if (this.recordingState() === 'recording') {
            void this.finishReading();
          }
        }, 1200);
      });
    });
  }

  private autoStopTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    forkJoin({
      reader: this.readerService.book(this.bookId),
      progress: this.progressService.book(this.bookId),
      quiz: this.progressService.quiz(this.chapterId),
      // Stars are a nicety: an API without the endpoint must not stop the chapter opening.
      games: this.progressService
        .chapterGames(this.chapterId)
        .pipe(catchError(() => of({ data: [] as GameWinRecord[] }))),
    }).subscribe({
      next: ({ reader, progress, quiz, games }) => {
        const chapter = (reader.data.chapters ?? []).find((entry) => entry.id === this.chapterId);
        const node = progress.data.chapters.find((entry) => entry.id === this.chapterId);

        if (node?.is_locked) {
          this.router.navigate(['/student/books', this.bookId]);
          return;
        }

        this.title.set(chapter?.title ?? node?.title ?? 'Chapter');
        this.bookTitle = reader.data.title ?? '';
        this.chapterNumber.set(chapter?.chapter_number ?? node?.chapter_number ?? 0);
        const pages = (reader.data.pages ?? [])
          .filter((page) => page.chapter_id === this.chapterId)
          .sort((a, b) => a.page_number - b.page_number);
        this.readingPages.set(this.readingPagesOf(pages));

        // Games and read-aloud need the chapter's words. Fall back to the pages'
        // own text when the chapter has none of its own.
        const pagesText = pages
          .map((page) => page.text?.trim())
          .filter(Boolean)
          .join('\n\n');
        this.storyText.set(chapter?.story_text || pagesText || null);
        this.imageUrl.set(chapter?.image_url ?? null);
        this.readingLevel.set(progress.data.reading_level ?? null);
        this.themes.use(progress.data.theme, chapter?.theme ?? node?.theme);
        this.applyProgress(node?.progress ?? null);
        this.quizQuestions.set(quiz.data);
        this.gameWins.set(games.data ?? []);
        this.loading.set(false);

        this.loadReadAloudProgress();
      },
      error: (response: HttpErrorResponse) => {
        this.errorMessage.set(response.error?.message ?? 'Could not open this chapter.');
        this.loading.set(false);
      },
    });
  }

  ngOnDestroy(): void {
    this.queryParams?.unsubscribe();
    if (this.autoStopTimer) {
      clearTimeout(this.autoStopTimer);
    }
    this.stopNarration();
    this.themes.clear();
    // Leaving mid-reading must not leave the music ducked on the next screen.
    this.audioCues.restoreAfterRecording();
    // The microphone must not stay open when the child navigates away.
    void this.live.stop();
  }

  /**
   * The chapter's pages exactly as the teacher sees them: one book page, one
   * page to hear and read aloud. A "Chapter 2" line is not read — it heads the
   * page. A scan with no words gives its picture to the next page that has some.
   */
  private readingPagesOf(pages: BookPage[]): ReadingPage[] {
    const result: ReadingPage[] = [];
    let images: string[] = [];

    for (const page of pages) {
      const lines = (page.text ?? '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (page.image_url) {
        images.push(page.image_url);
      }
      const heading = lines.length && CHAPTER_HEADING.test(lines[0]) ? (lines.shift() ?? null) : null;

      if (!lines.length) {
        continue;
      }

      result.push({
        key: `${page.id}:0`,
        bookPageId: page.id,
        // The server counts a whole page as its one "paragraph".
        paragraphIndex: 0,
        text: lines.join('\n'),
        images,
        heading,
      });
      images = [];
    }

    // A picture after the last words still belongs to the chapter.
    if (images.length && result.length) {
      const last = result[result.length - 1];
      last.images = [...last.images, ...images];
    }

    return result;
  }

  /** Which pages were already read aloud, so the page map shows where the child stopped. */
  private loadReadAloudProgress(): void {
    if (!this.readByPage()) {
      this.scoresLoaded.set(true);
      this.watchPageParam();
      return;
    }

    this.progressService.readAloud(this.chapterId).subscribe({
      next: (response) => {
        this.applyReadAloud(response.data);
        this.scoresLoaded.set(true);
        this.watchPageParam();
      },
      // Progress is a nicety here; reading still works without it.
      error: () => {
        this.scoresLoaded.set(true);
        this.watchPageParam();
      },
    });
  }

  /**
   * The open page lives in the address (`?page=3`), so the back button closes
   * a page and returns to the page map, as a child expects.
   */
  private watchPageParam(): void {
    this.queryParams?.unsubscribe();
    this.queryParams = this.route.queryParamMap.subscribe((params) => {
      const page = Number(params.get('page'));

      if (!this.readByPage()) {
        // A chapter with no pages is one page: its whole story.
        this.showPage(0);
        return;
      }

      // "Continue reading": the first page not read yet (the last, once all are).
      if (params.get('page') === 'next') {
        const next = Math.min(this.firstUnread(), this.readingPages().length - 1);
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { page: next + 1 },
          replaceUrl: true,
        });
        return;
      }

      if (page >= 1) {
        this.showPage(page - 1);
      } else {
        this.closePage();
      }
    });
  }

  private applyReadAloud(summary: ReadAloudSummary): void {
    this.readAloudSummary.set(summary);
    this.pageScores.set(
      Object.fromEntries(
        summary.pages.map((page) => [`${page.book_page_id}:${page.paragraph_index}`, page.best_score]),
      ),
    );

    if (summary.passed) {
      this.pronunciationPassed.set(true);
    }
  }

  /** Best score so far on a reading page, or null when it has not been read yet. */
  scoreOf(page: ReadingPage): number | null {
    return this.pageScores()[page.key] ?? null;
  }

  /** A page picked on the page map. */
  pickPage(pick: LevelStopPick): void {
    this.audioCues.play('tap', 0.4);
    this.openPage(pick.stop.id - 1);
  }

  /** Open a page of the chapter (counted from 0), through the address bar. */
  openPage(index: number): void {
    if (index < 0 || index >= this.readingPages().length || index > this.firstUnread()) {
      return;
    }
    if (this.isBusy() || this.recordingState() === 'recording' || this.retryTarget()) {
      return;
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: index + 1 },
      // Turning from one page to the next is not a new place to go back to.
      replaceUrl: this.pageOpen(),
    });
  }

  /** Back to the page map. */
  backToPages(): void {
    if (this.isBusy() || this.recordingState() === 'recording') {
      return;
    }

    this.router.navigate([], { relativeTo: this.route, queryParams: { page: null } });
  }

  /** Put one page on screen, ready to hear and read aloud. */
  private showPage(index: number): void {
    const pages = this.readingPages();
    // A page further on than the child has reached (a typed address, say)
    // opens the first one they have not read.
    const target = pages.length ? Math.min(index, this.firstUnread(), pages.length - 1) : 0;

    this.stopReading();
    this.activeStep.set('pages');
    this.readIndex.set(target);
    this.pageOpen.set(true);
    this.layOutReadText();
    this.rememberPlace(target);

    // Reaching the last page is reading the chapter through.
    if (!this.storyRead() && (!this.readByPage() || target === pages.length - 1)) {
      this.markStoryRead();
    }
  }

  /** So "Let's read!" on the home screen can bring the child back to this page. */
  private rememberPlace(index: number): void {
    const total = this.readingPages().length || 1;

    this.places.remember({
      bookId: this.bookId,
      bookTitle: this.bookTitle,
      kind: 'chapter',
      chapterId: this.chapterId,
      chapterTitle: `Chapter ${this.chapterNumber()}`,
      page: index + 1,
      pageLabel: `Page ${index + 1} of ${total}`,
    });
  }

  private closePage(): void {
    this.stopReading();
    this.pageOpen.set(false);
    this.result.set(null);
    this.showScore.set(false);
  }

  /** Stop the voice and the microphone before the words on screen change. */
  private stopReading(): void {
    this.stopNarration();

    if (this.retryTarget()) {
      void this.live.abandonWordRetry();
      this.retryTarget.set(null);
    }
    if (this.recordingState() !== 'idle') {
      void this.live.stop();
      void this.recorder.stop().catch(() => undefined);
      this.recordingState.set('idle');
    }
  }

  /** Show the words about to be read, uncoloured, before recording starts. */
  private layOutReadText(): void {
    this.result.set(null);
    this.showScore.set(false);
    this.live.prepare(this.readText() ?? '', this.readingLevel());
  }

  /** Apply the chapter's progress; true when this is what finished the chapter. */
  private applyProgress(progress: ChapterProgress | null): boolean {
    const wasCompleted = this.completed();

    this.storyRead.set(progress?.story_read ?? false);
    this.pronunciationPassed.set(progress?.pronunciation_passed ?? false);
    this.gameCompleted.set(progress?.game_completed ?? false);
    this.quizPassed.set(progress?.quiz_passed ?? false);
    this.completed.set(progress?.status === 'completed');

    // Only a change seen on this screen is cheered, not the state it opened in.
    const justCompleted = !this.loading() && !wasCompleted && this.completed();
    if (justCompleted) {
      this.cheerChapterComplete();
    }

    return justCompleted;
  }

  /**
   * Reading aloud can be the step that finishes the chapter, but its response
   * carries no chapter progress — only the milestone. True when it did.
   */
  private completedByMilestone(celebrations: Celebrations | null | undefined): boolean {
    const milestone = celebrations?.milestone;
    if (this.completed() || (milestone !== 'chapter_completed' && milestone !== 'book_completed')) {
      return false;
    }

    this.completed.set(true);
    this.cheerChapterComplete();
    return true;
  }

  /** A finished chapter: kids cheering, and party poppers at both sides. */
  private cheerChapterComplete(): void {
    this.cheers.cheer('congrats', 'Congrats! Chapter complete!', {
      sound: 'yey',
      confetti: ['sides', 'drop'],
    });
  }

  go(step: StepKey): void {
    this.stopNarration();
    this.activeStep.set(step);

    // Leaving the pages closes the open page, so coming back shows the map.
    if (step !== 'pages' && this.pageOpen()) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { page: null },
        replaceUrl: true,
      });
    }
  }

  // ---- Pages ----
  markStoryRead(): void {
    this.progressService.markStoryRead(this.chapterId).subscribe({
      next: (response) => this.applyProgress(response.data),
    });
  }

  /** Read the open page to the child — this page only, not the whole chapter. */
  toggleNarration(): void {
    if (this.narrating()) {
      this.stopNarration();
      return;
    }

    const page = this.readByPage() ? this.currentReadPage() : null;

    if (!page && !this.storyText()) {
      this.errorMessage.set('This chapter has no text to read aloud yet.');
      return;
    }

    const run = ++this.narrationRun;
    this.errorMessage.set(null);
    this.narrating.set(true);
    this.narrationLoading.set(true);

    const request = page
      ? this.narrationService.getPageNarration(page.bookPageId, page.paragraphIndex)
      : this.narrationService.getNarration(this.chapterId);

    request.subscribe({
      next: (blob) => {
        // The child may have stopped, or turned the page, while this loaded.
        if (run !== this.narrationRun || !this.narrating()) {
          return;
        }

        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        this.audio = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          this.narrating.set(false);
        };
        void audio.play();
        this.narrationLoading.set(false);
      },
      error: (response: HttpErrorResponse) => {
        if (run !== this.narrationRun) {
          return;
        }
        this.stopNarration();
        this.errorMessage.set(this.narrationError(response.status));
      },
    });
  }

  stopNarration(): void {
    this.narrationRun++;
    this.stopAudio();
    this.narrating.set(false);
    this.narrationLoading.set(false);
  }

  private stopAudio(): void {
    if (this.audio) {
      this.audio.onended = null;
      this.audio.pause();
      this.audio = null;
    }
  }

  // ---- Read aloud (pronunciation) ----

  async toggleRecording(): Promise<void> {
    const text = this.readText();

    if (!text) {
      this.errorMessage.set('There is no text to read on this chapter.');
      return;
    }

    if (this.recordingState() === 'recording') {
      await this.finishReading();
      return;
    }

    if (this.isBusy()) {
      return;
    }

    this.errorMessage.set(null);
    this.result.set(null);
    this.celebrations.set(null);
    this.showScore.set(false);
    this.stopNarration();
    this.recordingState.set('connecting');

    try {
      if (this.liveAvailable()) {
        await this.live.start(text, this.readingLevel());
      } else {
        this.live.prepare(text, this.readingLevel());
        await this.recorder.start();
      }

      this.recordingState.set('recording');
    } catch (error) {
      this.recordingState.set('idle');

      if ((error as { name?: string })?.name === 'NotAllowedError') {
        this.errorMessage.set('Please allow microphone access to record your reading.');
        return;
      }

      // Live colouring is a bonus; the real score comes from the recording, so
      // drop back to plain recording rather than blocking the child.
      this.liveAvailable.set(false);

      try {
        this.live.prepare(text, this.readingLevel());
        await this.recorder.start();
        this.recordingState.set('recording');
      } catch {
        this.errorMessage.set('Could not start recording. Please try again.');
      }
    }
  }

  private async finishReading(): Promise<void> {
    this.recordingState.set('assessing');

    let audio: Blob | null = null;

    try {
      audio = this.liveAvailable() ? await this.live.stop() : await this.recorder.stop();
    } catch {
      this.recordingState.set('idle');
      this.errorMessage.set('Could not process the recording. Please try again.');
      return;
    }

    if (!audio) {
      this.recordingState.set('idle');
      return;
    }

    const page = this.readByPage() ? this.currentReadPage() : null;
    const target = page
      ? { chapterId: this.chapterId, bookPageId: page.bookPageId, paragraphIndex: page.paragraphIndex }
      : { chapterId: this.chapterId };

    const wasPassed = this.pronunciationPassed();

    this.pronunciationService.assess(audio, target).subscribe({
      next: (response) => {
        // The child went back to the page map while this was being scored:
        // keep the score, but do not pop it up over a different screen.
        const stillHere = this.pageOpen() && (!page || this.currentReadPage()?.key === page.key);

        // Leaving already set the microphone to idle, and the child may be
        // recording the next page by now, so leave the state alone.
        if (!stillHere) {
          if (response.meta.read_aloud) {
            this.applyReadAloud(response.meta.read_aloud);
          }
          return;
        }

        this.result.set(response.data);
        this.celebrations.set(response.celebrations);
        this.paceHint.set(response.meta.pace_hint);
        this.applyServerWords(response.data);

        if (response.meta.read_aloud) {
          // Page by page, the chapter passes on all its pages, not on this one.
          this.applyReadAloud(response.meta.read_aloud);
        } else if (response.data.passed) {
          this.pronunciationPassed.set(true);
        }

        this.recordingState.set('idle');
        this.showScore.set(true);

        if (this.completedByMilestone(response.celebrations)) {
          // The chapter's own cheer has the confetti and the "yey".
        } else if (!wasPassed && this.pronunciationPassed() && this.readByPage()) {
          // The "Read story" activity done: the same party as a finished chapter.
          this.cheers.cheer('congrats', 'Congrats! You read every page!', {
            sound: 'yey',
            confetti: ['sides'],
          });
        } else {
          this.cheers.forScore(response.data.effective_score, this.passMark);
        }
      },
      error: (response: HttpErrorResponse) => {
        if (this.recordingState() === 'assessing') {
          this.recordingState.set('idle');
        }
        this.errorMessage.set(this.assessError(response.status));
      },
    });
  }

  /** Repaint the story from the server's verdict, which saw the whole reading. */
  private applyServerWords(attempt: PronunciationAttempt): void {
    const current = this.words();

    if (!attempt.words?.length || attempt.words.length !== current.length) {
      return;
    }

    this.live.words.set(
      current.map((word, position) => {
        const scored = attempt.words![position];
        const correct =
          scored.error_type === 'None' &&
          (scored.accuracy_score === null || scored.accuracy_score >= 60);

        return {
          ...word,
          accuracy: scored.accuracy_score,
          state:
            scored.error_type === 'Omission'
              ? ('omitted' as const)
              : correct
                ? ('correct' as const)
                : ('incorrect' as const),
        };
      }),
    );
  }

  /** The child wants another go at one word. */
  async retryWord(word: LiveWord): Promise<void> {
    if (this.isBusy() || this.recordingState() === 'recording') {
      return;
    }

    this.errorMessage.set(null);
    this.retryTarget.set(word);
    this.speakWord(word.text);

    if (!this.liveAvailable()) {
      return;
    }

    this.recordingState.set('connecting');

    try {
      await this.live.startWordRetry(word.index);
      this.recordingState.set('recording');
    } catch {
      this.recordingState.set('idle');
      this.retryTarget.set(null);
      this.errorMessage.set('Could not listen for that word. Please try again.');
    }
  }

  async finishWordRetry(): Promise<void> {
    this.recordingState.set('retrying');

    try {
      const outcome = await this.live.finishWordRetry();
      this.audioCues.playResult(outcome.correct);
    } catch {
      this.errorMessage.set('Could not check that word. Please try again.');
    } finally {
      this.retryTarget.set(null);
      this.recordingState.set('idle');
    }
  }

  /** Colour band for a live meter — encouraging, never alarming. */
  meterTone(value: number): 'great' | 'good' | 'grow' {
    return value >= 85 ? 'great' : value >= this.passMark ? 'good' : 'grow';
  }

  cancelWordRetry(): void {
    // Puts the whole story back; a plain stop() would leave only the retry word.
    void this.live.abandonWordRetry();
    this.retryTarget.set(null);
    this.recordingState.set('idle');
  }

  /** Say one word to the child, slowly. */
  speakWord(word: string): void {
    // The narration voice, not the browser's robotic one.
    void this.narrationService.say(word, 0.8);
  }

  dismissScore(): void {
    this.showScore.set(false);
  }

  async readAgain(): Promise<void> {
    this.showScore.set(false);
    this.result.set(null);
    this.live.prepare(this.readText() ?? '', this.readingLevel());
    await this.toggleRecording();
  }

  continueAfterScore(): void {
    this.showScore.set(false);

    // Page by page, "next" turns to the next page until the last one.
    if (this.readByPage() && !this.isLastReadPage()) {
      this.openPage(this.readIndex() + 1);
      return;
    }

    if (this.pronunciationPassed()) {
      this.go('game');
      return;
    }

    // The last page, but the chapter needs more: back to the map to pick a
    // page to read again.
    if (this.readByPage()) {
      this.backToPages();
    }
  }

  /** The score popup's forward button, which says where it goes. */
  readonly scoreNextLabel = computed(() => {
    if (this.readByPage() && !this.isLastReadPage()) {
      return 'Next page';
    }
    if (this.pronunciationPassed()) {
      return 'Play a game';
    }
    return this.readByPage() ? 'Back to the pages' : 'Keep going';
  });

  // ---- Game ----
  pickGame(kind: GameKind): void {
    this.pickedGame.set(kind);
    this.gameMessage.set(null);
  }

  /** Stars for the picker: one for a win, two for a win with no mistakes. */
  starsFor(option: GameOption): number {
    if (!option.win) {
      return 0;
    }
    return option.win.perfect ? 2 : 1;
  }

  onGameCompleted(kind: GameKind, mistakes: number): void {
    const title = this.gameOptions().find((option) => option.kind === kind)?.title ?? 'Game';

    this.progressService.completeGame(this.chapterId, kind, mistakes).subscribe({
      next: (response) => {
        const finishedChapter = this.applyProgress(response.data);

        const game = response.game;
        if (game) {
          this.gameWins.set(game.games);

          if (game.points_earned > 0) {
            this.gameMessage.set(
              game.perfect
                ? `+${game.points_earned} points — no mistakes, bonus stars!`
                : `+${game.points_earned} points!`,
            );
            this.celebrationService.pushPoints(
              game.points_earned,
              `${title} won!`,
              game.perfect ? 'No mistakes — bonus points!' : 'Great playing!',
            );
          } else {
            // Replays are for fun; say so, so the missing points are not a surprise.
            this.gameMessage.set('You already won this one. Try another game for more stars!');
          }
        }

        // Finishing the chapter has its own, bigger cheer.
        if (!finishedChapter) {
          this.cheers.cheer('great', game?.perfect ? 'Perfect! Great job!' : undefined, {
            sound: 'yippee',
            confetti: ['drop'],
          });
        }

        // Winning the game can finish the chapter, which can earn a badge.
        this.celebrationService.push(response.celebrations);
      },
    });
  }

  // ---- Quiz ----

  /** Picking an answer checks it straight away; the verdict stays until "Next". */
  choose(questionId: number, choice: string): void {
    if (this.quizFeedback() || this.quizChecking()) {
      return;
    }

    this.answers.update((current) => ({ ...current, [questionId]: choice }));
    this.quizChecking.set(true);

    this.progressService.checkQuizAnswer(this.chapterId, questionId, choice).subscribe({
      next: (response) => {
        const { correct, correct_answer } = response.data;
        this.quizFeedback.set({
          picked: choice,
          correct,
          correctAnswer: correct_answer,
          message: this.pickMessage(correct ? PRAISE : ENCOURAGE),
        });
        this.audioCues.playResult(correct);
        this.cheers.cheer(correct ? 'great' : 'try-again', correct ? undefined : 'Good try!');
        this.quizChecking.set(false);
      },
      error: () => {
        // The answer is still graded on submit; only the instant verdict is lost.
        this.quizFeedback.set({
          picked: choice,
          correct: null,
          correctAnswer: null,
          message: 'Answer saved!',
        });
        this.quizChecking.set(false);
      },
    });
  }

  isChosen(questionId: number, choice: string): boolean {
    return this.answers()[questionId] === choice;
  }

  /** Green for the right answer (picked or not), red for a wrong pick. */
  choiceState(choice: string): 'right' | 'wrong' | null {
    const feedback = this.quizFeedback();
    if (!feedback || feedback.correct === null) {
      return null;
    }
    if (choice === feedback.correctAnswer) {
      return 'right';
    }
    return choice === feedback.picked ? 'wrong' : null;
  }

  nextQuestion(): void {
    if (this.isLastQuestion()) {
      this.submitQuiz();
      return;
    }

    this.quizFeedback.set(null);
    this.quizIndex.update((index) => index + 1);
  }

  submitQuiz(): void {
    if (this.quizSubmitting()) {
      return;
    }
    this.quizSubmitting.set(true);

    this.progressService.submitQuiz(this.chapterId, this.answers()).subscribe({
      next: (response) => {
        const result = response.data;
        this.quizResult.set({
          score: result.score,
          correct: result.correct,
          total: result.total,
          passed: result.passed,
          review: result.review ?? [],
        });
        this.quizSubmitting.set(false);
        const finishedChapter = this.applyProgress(result.progress);
        if (!finishedChapter) {
          if (result.passed) {
            this.cheers.cheer('congrats', 'Congrats! You passed the quiz!', {
              sound: 'yippee',
              confetti: ['drop'],
            });
          } else {
            this.cheers.cheer('try-again', 'Try the quiz again!', { sound: 'not-passed' });
          }
        } else {
          // The chapter's own cheer has the confetti and the "yey"; the quiz
          // still gets its "yippee", once the cheering has died down.
          setTimeout(() => this.audioCues.play('yippee', 0.7), 1200);
        }
        // A passed quiz can finish the chapter — and the book behind it.
        this.celebrationService.push(response.celebrations);
      },
      error: (response: HttpErrorResponse) => {
        this.quizSubmitting.set(false);
        this.errorMessage.set(response.error?.message ?? 'Could not send your answers. Please try again.');
      },
    });
  }

  /** The question text for a summary row. */
  questionText(questionId: number): string {
    return this.quizQuestions().find((question) => question.id === questionId)?.question_text ?? '';
  }

  retryQuiz(): void {
    this.answers.set({});
    this.quizResult.set(null);
    this.quizFeedback.set(null);
    this.quizIndex.set(0);
  }

  private pickMessage(options: string[]): string {
    return options[Math.floor(Math.random() * options.length)];
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

  /**
   * The sentence this word appears in, with the word itself blanked out.
   * Null when it cannot be found in one short enough to be a help.
   */
  private clueFor(word: string, text: string): string | null {
    const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');

    const sentence = this.pickSentences(text).find((candidate) => pattern.test(candidate));

    if (!sentence || sentence.split(' ').length > 20) {
      return null;
    }

    return sentence.replace(pattern, '_____');
  }

  /** Split the story into clean sentences for the word/sentence games. */
  private pickSentences(text: string): string[] {
    // Headings ("Solids") have no full stop, so left in they glue onto the
    // front of the next sentence. Scanned lines also break mid-sentence, so
    // only short, unpunctuated lines followed by a capital are dropped.
    const lines = text.split('\n').map((line) => line.trim());
    const body = lines
      .filter((line, i) => {
        const next = lines.slice(i + 1).find(Boolean) ?? '';
        const heading =
          !/[.!?,;:"'”’)]$/.test(line) && line.split(/\s+/).length <= 4 && !/^[a-z]/.test(next);
        return line && !heading;
      })
      .join(' ');

    // A full stop after a title ("Mrs. Post") does not end the sentence.
    return body
      .split(/(?<=[.!?]["'”’)]?)(?<!\b(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|Mt)\.)\s+/)
      .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
      .filter((sentence) => sentence.split(' ').length >= 4);
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
