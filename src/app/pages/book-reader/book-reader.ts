import {
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  OnInit,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ReaderService } from '../../services/reader/reader';
import { NarrationService } from '../../services/narration/narration';
import { RecorderService } from '../../services/recorder/recorder';
import { LiveReadingService } from '../../services/live-reading/live-reading';
import {
  LiveWord,
  alignScoredWords,
  stateFor,
} from '../../services/live-reading/word-alignment';
import { AudioService } from '../../services/audio/audio';
import { CelebrationService } from '../../services/celebration/celebration';
import { PronunciationService } from '../../services/pronunciation/pronunciation';
import { ProgressService } from '../../services/progress/progress';
import {
  Book,
  BookPageProgress,
  Celebrations,
  PronunciationAttempt,
} from '../../models';
import {
  Alert,
  Button,
  EmptyState,
  Icon,
  LiveTranscript,
  ReadingText,
  ScoreModal,
  Spinner,
  StatusIndicator,
} from '../../shared/components';

interface ReadingLeaf {
  kind: 'page' | 'chapter';
  id: number;
  label: string;
  imageUrl: string | null;
  text: string | null;
}

/**
 * What the reader is doing right now.
 *
 * `connecting` is its own state on purpose: opening the microphone and getting
 * a token takes a beat, and a button that does nothing for a second is a button
 * a child presses again.
 */
type ReadingState = 'idle' | 'connecting' | 'listening' | 'assessing' | 'retrying';

@Component({
  selector: 'app-book-reader',
  imports: [
    RouterLink,
    Alert,
    Button,
    EmptyState,
    Spinner,
    Icon,
    LiveTranscript,
    ReadingText,
    ScoreModal,
    StatusIndicator,
  ],
  templateUrl: './book-reader.html',
  styleUrl: './book-reader.scss',
})
export class BookReader implements OnInit, OnDestroy {
  private readerService = inject(ReaderService);
  private narrationService = inject(NarrationService);
  private recorder = inject(RecorderService);
  private live = inject(LiveReadingService);
  private audio = inject(AudioService);
  private celebrationService = inject(CelebrationService);
  private pronunciation = inject(PronunciationService);
  private progressService = inject(ProgressService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly bookId = Number(this.route.snapshot.paramMap.get('bookId'));
  /** A picture-book chapter picked in the kingdom; null reads the whole book. */
  private readonly chapterId = Number(this.route.snapshot.queryParamMap.get('chapter')) || null;
  readonly book = signal<Book | null>(null);
  readonly leaves = signal<ReadingLeaf[]>([]);
  readonly index = signal(0);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly current = computed<ReadingLeaf | null>(() => this.leaves()[this.index()] ?? null);
  readonly total = computed(() => this.leaves().length);
  readonly isLastLeaf = computed(() => this.total() > 0 && this.index() === this.total() - 1);

  /** Page-by-page progress; only page-based books have it. */
  readonly pageProgress = signal<BookPageProgress | null>(null);
  readonly markingRead = signal(false);

  /** This page's progress row, when the book is page-based. */
  readonly currentPage = computed(() => {
    const leaf = this.current();
    if (!leaf || leaf.kind !== 'page') {
      return null;
    }
    return this.pageProgress()?.pages.find((page) => page.id === leaf.id) ?? null;
  });

  readonly isPageBook = computed(() => this.book()?.type === 'scanned');
  readonly bookFinished = computed(() => this.pageProgress()?.is_completed ?? false);

  readonly narrating = signal(false);
  readonly narrationLoading = signal(false);
  private audioElement: HTMLAudioElement | null = null;

  // Which way the page is turning, so the flip animation leans the right way.
  readonly turnDirection = signal<'next' | 'prev'>('next');

  // ---- Reading ---------------------------------------------------------

  readonly readingState = signal<ReadingState>('idle');
  readonly result = signal<PronunciationAttempt | null>(null);
  readonly celebrations = signal<Celebrations | null>(null);
  readonly showScore = signal(false);
  readonly passMark = signal(60);
  readonly paceHint = signal<string | null>(null);

  /** The word the child is currently having another go at. */
  readonly retryTarget = signal<LiveWord | null>(null);

  /**
   * The recording is with the server. Separate from readingState because the
   * child may retry a red word while it is: the live pass already knows which
   * words went wrong, and there is no reason to make them wait.
   */
  readonly scoring = signal(false);

  /** A server result that landed mid-retry, applied once the retry is over. */
  private deferredResult: PronunciationAttempt | null = null;

  /**
   * Retries on this reading, by page word index. One made before the server
   * result arrived has nothing to be saved against yet, and the server's
   * repaint would turn the word red again — so they are replayed onto it.
   */
  private retryOutcomes = new Map<number, { correct: boolean; accuracy: number | null }>();

  /** The passage, word by word, with whatever verdict each word has so far. */
  readonly words = this.live.words;
  readonly partialTranscript = this.live.partial;
  readonly liveTranscript = this.live.transcript;
  /** Accuracy, fluency, intonation and diction so far, as child-labelled meters. */
  readonly liveMeters = this.live.meters;
  readonly livePace = this.live.pace;
  readonly liveWpm = this.live.wordsPerMinute;
  readonly liveScore = this.live.score;

  /** Off when the browser cannot do live assessment; we still record and score. */
  readonly liveAvailable = signal(true);

  readonly isBusy = computed(() =>
    ['connecting', 'assessing', 'retrying'].includes(this.readingState()),
  );

  /**
   * Red words can be tapped once the child has stopped reading — as soon as
   * the live pass has ended, not only after the server's verdict is back.
   */
  readonly wordsTappable = computed(() => {
    const state = this.readingState();

    return (
      !this.retryTarget() &&
      (state === 'idle' || state === 'assessing') &&
      this.live.state() === 'idle' &&
      (!!this.result() || this.live.missed().length > 0)
    );
  });

  readonly muted = this.audio.muted;
  readonly musicEnabled = this.audio.musicEnabled;

  /**
   * What to tell the pupil after a score. Reading the wrong words and reading
   * only some of them need different advice, and neither is "read slower".
   */
  readonly readAloudHint = computed(() => {
    const attempt = this.result();
    if (!attempt) {
      return null;
    }
    if (attempt.is_off_script) {
      return 'Read the words on the page out loud and try again.';
    }
    if ((attempt.text_match_score ?? 0) < this.passMark()) {
      return 'You read part of the page — read the whole page out loud and try again.';
    }
    return null;
  });

  /** The music must not play into the microphone while the child reads. */
  private readonly micDucking = effect(() => {
    const state = this.readingState();
    const micOpen = state === 'connecting' || state === 'listening' || state === 'retrying';

    untracked(() =>
      micOpen ? this.audio.duckForRecording() : this.audio.restoreAfterRecording(),
    );
  });

  ngOnInit(): void {
    this.liveAvailable.set(this.live.isSupported);

    this.readerService.book(this.bookId).subscribe({
      next: (response) => {
        const book = response.data;
        this.book.set(book);
        this.leaves.set(this.buildLeaves(book));
        this.loading.set(false);
        this.layOutPage();

        if (book.type === 'scanned') {
          this.loadPageProgress();
        }
      },
      error: (response) => {
        this.errorMessage.set(this.readError(response));
        this.loading.set(false);
      },
    });

    this.audio.startMusic();
  }

  ngOnDestroy(): void {
    this.stopNarration();
    this.audio.stopMusic();
    // Leaving mid-reading must not leave the music ducked on the next screen.
    this.audio.restoreAfterRecording();
    // Leaving the page with the microphone still open is the one bug a child
    // cannot recover from themselves.
    void this.live.stop();
  }

  private buildLeaves(book: Book): ReadingLeaf[] {
    if (book.type === 'scanned') {
      const pages = book.pages ?? [];
      const inChapter = pages.filter((page) => page.chapter_id === this.chapterId);
      // An unknown chapter falls back to the whole book rather than an empty one.
      return (inChapter.length ? inChapter : pages).map((page) => ({
        kind: 'page' as const,
        id: page.id,
        label: `Page ${page.page_number}`,
        imageUrl: page.image_url,
        text: page.text,
      }));
    }
    return (book.chapters ?? []).map((chapter) => ({
      kind: 'chapter' as const,
      id: chapter.id,
      label: `Chapter ${chapter.chapter_number}: ${chapter.title}`,
      imageUrl: chapter.image_url,
      text: chapter.story_text,
    }));
  }

  /** Put this page's words on screen, uncoloured, ready to be read. */
  private layOutPage(): void {
    this.live.prepare(this.current()?.text ?? '', this.book()?.reading_level);
  }

  next(): void {
    if (this.index() < this.total() - 1) {
      this.leavePage();
      this.turnDirection.set('next');
      this.index.update((value) => value + 1);
      this.layOutPage();
      this.audio.play('page-turn', 0.35);
    }
  }

  previous(): void {
    if (this.index() > 0) {
      this.leavePage();
      this.turnDirection.set('prev');
      this.index.update((value) => value - 1);
      this.layOutPage();
      this.audio.play('page-turn', 0.35);
    }
  }

  /** Everything that must stop when the child moves off a page. */
  private leavePage(): void {
    this.stopNarration();
    void this.live.stop();
    this.readingState.set('idle');
    this.result.set(null);
    this.celebrations.set(null);
    this.showScore.set(false);
    this.retryTarget.set(null);
    this.scoring.set(false);
    this.deferredResult = null;
    this.retryOutcomes.clear();
  }

  // ============================================================
  //  Reading aloud
  // ============================================================

  async toggleRecording(): Promise<void> {
    if (this.readingState() === 'listening') {
      await this.finishReading();
      return;
    }

    // Not while the last reading is still being scored: its result would land
    // on top of the new one.
    if (this.isBusy() || this.scoring()) {
      return;
    }

    await this.beginReading();
  }

  private async beginReading(): Promise<void> {
    const leaf = this.current();

    if (!leaf?.text) {
      this.errorMessage.set('There is no text to read on this page.');
      return;
    }

    this.errorMessage.set(null);
    this.result.set(null);
    this.celebrations.set(null);
    this.showScore.set(false);
    // A new reading: the last one's retries belong to the last one's attempt.
    this.deferredResult = null;
    this.retryOutcomes.clear();
    this.stopNarration();
    this.readingState.set('connecting');

    try {
      if (this.liveAvailable()) {
        await this.live.start(leaf.text, this.book()?.reading_level);
      } else {
        this.layOutPage();
        await this.recorder.start();
      }

      this.readingState.set('listening');
    } catch (error) {
      // The child left the page while the microphone was opening; there is
      // nothing to fall back to.
      if (this.readingState() !== 'connecting') {
        return;
      }

      this.readingState.set('idle');

      // A refused microphone and a refused token need different words: one the
      // child can fix, the other only their teacher can.
      if (this.isMicrophoneRefusal(error)) {
        this.errorMessage.set('Please allow microphone access to record your reading.');
        return;
      }

      // Live scoring is a nicety; plain recording still gets a real score, so
      // fall back to it rather than telling a child they cannot read today.
      this.liveAvailable.set(false);

      try {
        this.layOutPage();
        await this.recorder.start();
        this.readingState.set('listening');
      } catch {
        this.errorMessage.set('Could not start recording. Please try again.');
      }
    }
  }

  private async finishReading(): Promise<void> {
    const leaf = this.current();
    this.readingState.set('assessing');

    let audio: Blob | null = null;

    try {
      audio = this.liveAvailable() ? await this.live.stop() : await this.recorder.stop();
    } catch {
      this.readingState.set('idle');
      this.errorMessage.set('Could not process the recording. Please try again.');
      return;
    }

    if (!audio || !leaf) {
      this.readingState.set('idle');
      return;
    }

    const target = leaf.kind === 'page' ? { bookPageId: leaf.id } : { chapterId: leaf.id };

    // The live phase is over: the page is free again (red words can be
    // retried) while the server works out the real score.
    this.readingState.set('idle');
    this.scoring.set(true);

    this.pronunciation.assess(audio, target).subscribe({
      next: (response) => {
        // The child may have turned the page while this was on its way.
        if (!this.isCurrentLeaf(leaf)) {
          return;
        }

        this.scoring.set(false);
        this.result.set(response.data);
        this.celebrations.set(response.celebrations);
        this.passMark.set(response.meta.pass_mark);
        this.paceHint.set(response.meta.pace_hint);

        if (leaf.kind === 'page') {
          this.loadPageProgress();
        }

        // Mid-retry, the page is set aside inside the live reader; repainting
        // it now would be lost when the retry hands it back.
        if (this.retryTarget()) {
          this.deferredResult = response.data;
          return;
        }

        this.presentResult(response.data);
      },
      error: (response: HttpErrorResponse) => {
        if (!this.isCurrentLeaf(leaf)) {
          return;
        }

        this.scoring.set(false);
        this.errorMessage.set(this.assessError(response.status));
      },
    });
  }

  private isCurrentLeaf(leaf: ReadingLeaf): boolean {
    const current = this.current();

    return !!current && current.kind === leaf.kind && current.id === leaf.id;
  }

  /** Recolour the page from the server's verdict and show the score. */
  private presentResult(attempt: PronunciationAttempt): void {
    this.deferredResult = null;

    // The server saw the whole recording; its per-word verdict is better
    // than the one assembled live, so the page is recoloured from it.
    this.applyServerWords(attempt);

    // …except for words the child has already put right since. Those retries
    // had nothing to be saved against until now.
    for (const [index, outcome] of this.retryOutcomes) {
      this.markWord(index, outcome.correct, outcome.accuracy);
      this.saveRetry(attempt, index, outcome.accuracy);
    }

    this.showScore.set(true);
  }

  /**
   * Repaint the page from the attempt the server stored.
   *
   * The live pass only ever saw fragments as they arrived; this one is scored
   * against the whole recording, so where the two disagree the server wins.
   * The two lists are aligned word by word rather than by position — Azure's
   * list carries insertions and can tokenise differently from the page — so a
   * page word the server did not score keeps its live colour.
   */
  private applyServerWords(attempt: PronunciationAttempt): void {
    if (!attempt.words?.length) {
      return;
    }

    const current = this.words();
    const pairs = alignScoredWords(current, attempt.words);

    this.live.words.set(
      current.map((word) => {
        const scored = pairs.get(word.index);

        return scored
          ? { ...word, accuracy: scored.accuracy_score, state: stateFor(scored) }
          : word;
      }),
    );
  }

  /** Colour one word by a retry's outcome. */
  private markWord(index: number, correct: boolean, accuracy: number | null): void {
    this.live.words.update((words) =>
      words.map((word) =>
        word.index === index
          ? { ...word, state: correct ? ('correct' as const) : ('incorrect' as const), accuracy }
          : word,
      ),
    );
  }

  /**
   * Keep a retry on the server, against the stored word it belongs to, so the
   * teacher sees the word was put right. Best effort: the child has already
   * heard how they did, and a lost save costs them nothing.
   */
  private saveRetry(attempt: PronunciationAttempt, index: number, accuracy: number | null): void {
    if (accuracy === null || !attempt.words?.length) {
      return;
    }

    const stored = alignScoredWords(this.words(), attempt.words).get(index);

    if (stored?.id === undefined) {
      return;
    }

    this.pronunciation.retryWord(attempt.id, stored.id, accuracy).subscribe({
      error: () => {
        /* the page already shows the result; nothing for the child to do */
      },
    });
  }

  /** The child tapped a word they got wrong and wants another go at it. */
  async retryWord(word: LiveWord): Promise<void> {
    if (this.isBusy() || this.readingState() === 'listening') {
      return;
    }

    this.errorMessage.set(null);
    this.retryTarget.set(word);

    // Hear it first — a child cannot fix a word they have never heard said.
    this.speakWord(word.text);

    if (!this.liveAvailable()) {
      // Without live scoring there is nothing to score one word against, so
      // hearing it is the whole of the help we can offer.
      return;
    }

    this.readingState.set('connecting');

    try {
      await this.live.startWordRetry(word.index);
      this.readingState.set('listening');
    } catch {
      // Pressed "Done" before it was ready — not a failure worth reporting.
      if (this.retryTarget() !== word) {
        return;
      }

      this.endWordRetry();
      this.errorMessage.set('Could not listen for that word. Please try again.');
    }
  }

  /** Finish a single-word retry and tell the child how it went. */
  async finishWordRetry(): Promise<void> {
    this.readingState.set('retrying');
    const target = this.retryTarget();

    try {
      const outcome = await this.live.finishWordRetry();
      this.audio.playResult(outcome.correct);

      if (target) {
        this.retryOutcomes.set(target.index, outcome);

        // With the server's attempt already on the page, save straight away;
        // otherwise presentResult() saves it once there is something to save to.
        const attempt = this.result();
        if (attempt && !this.deferredResult) {
          this.saveRetry(attempt, target.index, outcome.accuracy);
        }
      }
    } catch {
      this.errorMessage.set('Could not check that word. Please try again.');
    } finally {
      this.endWordRetry();
    }
  }

  async cancelWordRetry(): Promise<void> {
    // Hand the page back untouched — a bare stop() would leave the one retry
    // word on screen in place of the page.
    await this.live.abandonWordRetry();
    this.endWordRetry();
  }

  private endWordRetry(): void {
    this.retryTarget.set(null);
    this.readingState.set('idle');

    if (this.deferredResult) {
      this.presentResult(this.deferredResult);
    }
  }

  /** Colour band for a live meter — encouraging, never alarming. */
  meterTone(value: number): 'great' | 'good' | 'grow' {
    return value >= 85 ? 'great' : value >= this.passMark() ? 'good' : 'grow';
  }

  /** Read one word to the child, using the page's own narration voice. */
  speakWord(word: string): void {
    // There is no per-word narration endpoint; the browser's own voice is
    // instant, which matters more here than matching the narrator exactly.
    try {
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      utterance.rate = 0.75;
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    } catch {
      /* no speech synthesis on this device */
    }
  }

  // ============================================================
  //  Score modal
  // ============================================================

  dismissScore(): void {
    this.showScore.set(false);
  }

  async readAgain(): Promise<void> {
    this.showScore.set(false);
    this.result.set(null);
    this.layOutPage();
    await this.beginReading();
  }

  continueAfterScore(): void {
    this.showScore.set(false);

    if (this.isLastLeaf()) {
      this.finish();
    } else {
      this.next();
    }
  }

  // ============================================================
  //  Progress, narration, chrome
  // ============================================================

  private loadPageProgress(): void {
    this.progressService.bookPages(this.bookId).subscribe({
      next: (response) => this.pageProgress.set(response.data),
      // A book the pupil was not assigned still reads fine; it just isn't tracked.
      error: () => this.pageProgress.set(null),
    });
  }

  /** Tick this page off as read. */
  markPageRead(): void {
    const leaf = this.current();
    if (!leaf || leaf.kind !== 'page' || this.markingRead()) {
      return;
    }

    this.markingRead.set(true);
    this.progressService.markPageRead(leaf.id).subscribe({
      next: (response) => {
        this.pageProgress.set(response.data);
        this.markingRead.set(false);
        this.audio.play('correct', 0.4);
        // A picture page with no words is finished by this tap alone, so this
        // is where its badge would be earned.
        this.celebrationService.push(response.celebrations);
      },
      error: (response: HttpErrorResponse) => {
        this.markingRead.set(false);
        this.errorMessage.set(
          response.error?.message ?? 'Could not save your progress. Please try again.',
        );
      },
    });
  }

  /** Leave the book and go back to the library. */
  finish(): void {
    this.leavePage();
    this.router.navigate(['/student/library']);
  }

  toggleMute(): void {
    this.audio.toggleMute();
  }

  toggleMusic(): void {
    this.audio.toggleMusic();
  }

  private isMicrophoneRefusal(error: unknown): boolean {
    const name = (error as { name?: string })?.name;

    return name === 'NotAllowedError' || name === 'PermissionDeniedError';
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

  toggleNarration(): void {
    const leaf = this.current();
    if (!leaf) {
      return;
    }
    if (this.narrating()) {
      this.stopNarration();
      return;
    }
    if (!leaf.text) {
      this.errorMessage.set('This page has no text to read aloud yet.');
      return;
    }

    this.errorMessage.set(null);
    this.narrating.set(true);
    this.narrationLoading.set(true);

    const request =
      leaf.kind === 'page'
        ? this.narrationService.getPageNarration(leaf.id)
        : this.narrationService.getNarration(leaf.id);

    request.subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const element = new Audio(url);
        this.audioElement = element;
        element.onended = () => {
          URL.revokeObjectURL(url);
          this.narrating.set(false);
        };
        void element.play();
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
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
    }
    this.narrating.set(false);
  }

  private narrationError(status: number): string {
    switch (status) {
      case 503:
        return 'Read-aloud is not set up yet. Ask your teacher to add the Azure Speech key.';
      case 422:
        return 'This page has no text to read aloud yet.';
      default:
        return 'Could not read this page aloud. Please try again.';
    }
  }

  private readError(response: HttpErrorResponse): string {
    return response.error?.message ?? 'Could not open this book. Please try again.';
  }
}
