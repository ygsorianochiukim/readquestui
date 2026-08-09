import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ReaderService } from '../../services/reader/reader';
import { NarrationService } from '../../services/narration/narration';
import { RecorderService } from '../../services/recorder/recorder';
import { PronunciationService } from '../../services/pronunciation/pronunciation';
import { ProgressService } from '../../services/progress/progress';
import { Book, BookPageProgress, PronunciationAttempt } from '../../models';
import { Alert, Button, EmptyState, Spinner, Icon } from '../../shared/components';

interface ReadingLeaf {
  kind: 'page' | 'chapter';
  id: number;
  label: string;
  imageUrl: string | null;
  text: string | null;
}

@Component({
  selector: 'app-book-reader',
  imports: [RouterLink, Alert, Button, EmptyState, Spinner, Icon],
  templateUrl: './book-reader.html',
  styleUrl: './book-reader.scss',
})
export class BookReader implements OnInit {
  private readerService = inject(ReaderService);
  private narrationService = inject(NarrationService);
  private recorder = inject(RecorderService);
  private pronunciation = inject(PronunciationService);
  private progressService = inject(ProgressService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly bookId = Number(this.route.snapshot.paramMap.get('bookId'));
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
  private audio: HTMLAudioElement | null = null;

  // Which way the page is turning, so the flip animation leans the right way.
  readonly turnDirection = signal<'next' | 'prev'>('next');

  // Read-aloud pronunciation
  readonly recordingState = signal<'idle' | 'recording' | 'assessing'>('idle');
  readonly result = signal<PronunciationAttempt | null>(null);

  ngOnInit(): void {
    this.readerService.book(this.bookId).subscribe({
      next: (response) => {
        const book = response.data;
        this.book.set(book);
        this.leaves.set(this.buildLeaves(book));
        this.loading.set(false);

        if (book.type === 'scanned') {
          this.loadPageProgress();
        }
      },
      error: (response) => {
        this.errorMessage.set(this.readError(response));
        this.loading.set(false);
      },
    });
  }

  private buildLeaves(book: Book): ReadingLeaf[] {
    if (book.type === 'scanned') {
      return (book.pages ?? []).map((page) => ({
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

  next(): void {
    if (this.index() < this.total() - 1) {
      this.stopNarration();
      this.result.set(null);
      this.turnDirection.set('next');
      this.index.update((value) => value + 1);
    }
  }

  previous(): void {
    if (this.index() > 0) {
      this.stopNarration();
      this.result.set(null);
      this.turnDirection.set('prev');
      this.index.update((value) => value - 1);
    }
  }

  async toggleRecording(): Promise<void> {
    const leaf = this.current();
    if (!leaf || !leaf.text) {
      this.errorMessage.set('There is no text to read on this page.');
      return;
    }

    // Stop & score.
    if (this.recordingState() === 'recording') {
      this.recordingState.set('assessing');
      try {
        const audio = await this.recorder.stop();
        const target = leaf.kind === 'page' ? { bookPageId: leaf.id } : { chapterId: leaf.id };
        this.pronunciation.assess(audio, target).subscribe({
          next: (response) => {
            this.result.set(response.data);
            this.recordingState.set('idle');
            // A passing read-aloud finishes the page, so refresh the tracker.
            if (leaf.kind === 'page') {
              this.loadPageProgress();
            }
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

    // Start recording.
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
    this.stopNarration();
    this.router.navigate(['/student/library']);
  }

  /** Colour band for a score: great / good / try. */
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
