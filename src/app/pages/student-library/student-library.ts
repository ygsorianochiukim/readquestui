import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { ProgressService } from '../../services/progress/progress';
import { StudentAuthService } from '../../services/student-auth/student-auth';
import { AudioService } from '../../services/audio/audio';
import { BookOverview, ChapterNode } from '../../models';
import { PageChapter } from '../../models/progress/progress.model';
import {
  EmptyState,
  Icon,
  LevelMap,
  LevelStop,
  LevelStopLook,
  LevelStopPick,
  ProgressBar,
  Spinner,
} from '../../shared/components';

/** Which view the child is looking at. */
type Zoom = 'kingdom' | 'book';

/**
 * Where the zoom animation is. `in` flies the kingdom into a tower, `out` flies
 * back from it, `leaving` fades the rooms away before the kingdom returns.
 */
type ZoomPhase = 'idle' | 'in' | 'leaving' | 'out';

type RoomState = 'locked' | 'completed' | 'in-progress' | 'pending';

/**
 * A room inside a book: a chapter of a chapter book, or a group of pages in a
 * page book. One shape so the template draws both the same way.
 */
interface Room {
  id: number;
  number: number;
  title: string;
  state: RoomState;
  /** Page books only — how many of the room's pages are read. */
  pages?: { done: number; total: number; percent: number };
}

/** How far the kingdom is magnified when flying into a tower. */
const ZOOM_SCALE = 3.2;
/** Keep in step with the zoom keyframes in the stylesheet. */
const ZOOM_MS = 600;
const LEAVE_MS = 250;
/** With reduced motion the zoom becomes a short cross-fade. */
const FADE_MS = 200;

@Component({
  selector: 'app-student-library',
  imports: [EmptyState, Icon, LevelMap, ProgressBar, Spinner],
  templateUrl: './student-library.html',
  styleUrl: './student-library.scss',
})
export class StudentLibrary implements OnInit {
  private progressService = inject(ProgressService);
  private auth = inject(StudentAuthService);
  private audio = inject(AudioService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  private injector = inject(Injector);
  private readonly kingdomEl = viewChild<ElementRef<HTMLElement>>('kingdom');
  /** Whichever map is showing: the books, or the rooms of the open book. */
  private readonly map = viewChild(LevelMap);
  private zoomTimer: ReturnType<typeof setTimeout> | null = null;

  readonly books = signal<BookOverview[]>([]);
  readonly loading = signal(true);
  readonly points = signal(0);

  readonly zoom = signal<Zoom>('kingdom');
  readonly openBook = signal<BookOverview | null>(null);
  readonly chapters = signal<ChapterNode[]>([]);
  readonly chaptersLoading = signal(false);

  readonly zoomPhase = signal<ZoomPhase>('idle');
  /** The transform that lands the tapped tower in the middle of the view. */
  readonly zoomTarget = signal<{ transform: string; origin: string } | null>(null);

  readonly student = this.auth.student;

  readonly firstName = computed(() => this.student()?.first_name ?? 'Reader');

  /** The book the child is in the middle of — the one the banner names. */
  readonly currentBook = computed(
    () => this.books().find((book) => !book.is_locked && !book.is_completed) ?? null,
  );

  readonly booksCompleted = computed(
    () => this.books().filter((book) => book.is_completed).length,
  );

  readonly chaptersCompleted = computed(() =>
    this.books().reduce((total, book) => total + book.completed_chapters, 0),
  );

  readonly pagesCompleted = computed(() =>
    this.books().reduce((total, book) => total + (book.completed_pages ?? 0), 0),
  );

  /** The books as stops on the level map, book 1 at the bottom. */
  readonly bookStops = computed<LevelStop[]>(() => {
    const currentId = this.currentBook()?.id;

    return this.books().map((book, index) => {
      const number = book.sequence || index + 1;
      const meta = this.progressLabel(book);
      return {
        id: book.id,
        number,
        title: book.title,
        meta,
        percent: book.percent,
        look: this.stateFor(book, book.id === currentId),
        label: `Book ${number}: ${book.title} — ${meta}`,
      };
    });
  });

  /**
   * The rooms of the opened book, for the zoomed-in view.
   *
   * A chapter book's rooms are its chapters. A page book's rooms are the
   * chapters its pages are grouped into, each measured in pages read.
   */
  readonly rooms = computed<Room[]>(() => {
    const book = this.openBook();

    if (book?.type === 'scanned') {
      return [...(book.page_chapters ?? [])]
        .sort((a, b) => a.sequence - b.sequence)
        .map((chapter, index) => this.pageRoom(chapter, index));
    }

    return this.chapters().map((chapter) => ({
      id: chapter.id,
      number: chapter.chapter_number,
      title: chapter.title,
      state: this.chapterState(chapter),
    }));
  });

  /**
   * The rooms as stops on the book's own map. The room to play next — the one
   * in progress, or else the first not yet started — is marked as current.
   */
  readonly roomStops = computed<LevelStop[]>(() => {
    const rooms = this.rooms();
    let next = rooms.findIndex((room) => room.state === 'in-progress');
    if (next < 0) {
      next = rooms.findIndex((room) => room.state === 'pending');
    }

    return rooms.map((room, index) => ({
      id: room.id,
      number: room.number,
      title: room.title,
      meta: room.pages
        ? `${room.pages.done} of ${room.pages.total} pages`
        : room.state === 'in-progress'
          ? 'In progress'
          : undefined,
      percent: room.pages?.percent,
      look:
        room.state === 'locked'
          ? 'locked'
          : room.state === 'completed'
            ? 'completed'
            : index === next
              ? 'current'
              : 'available',
      label: `Chapter ${room.number}: ${room.title}`,
    }));
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.clearZoomTimer());
  }

  ngOnInit(): void {
    this.progressService.overview().subscribe({
      next: (response) => {
        this.books.set(response.data);
        this.points.set(response.points ?? 0);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /**
   * Zoom into a building.
   *
   * The kingdom flies into the tapped tower, then the rooms fade up behind it.
   * A page book with no page chapters has nothing to show inside, so it opens
   * straight into the reader — zooming into an empty room would be a dead end.
   */
  enter(pick: LevelStopPick): void {
    const book = this.books().find((b) => b.id === pick.stop.id);

    if (!book || book.is_locked || this.zoomPhase() !== 'idle') {
      return;
    }

    this.audio.play('tap', 0.4);

    if (book.type === 'scanned' && !book.page_chapters?.length) {
      this.router.navigate(['/student/read', book.id]);
      return;
    }

    this.openBook.set(book);
    this.chapters.set([]);

    // Fetch while the zoom plays, so the rooms are usually ready as it lands.
    if (book.type !== 'scanned') {
      this.chaptersLoading.set(true);
      this.progressService.book(book.id).subscribe({
        next: (response) => {
          this.chapters.set(response.data.chapters);
          this.chaptersLoading.set(false);
        },
        error: () => this.chaptersLoading.set(false),
      });
    }

    this.zoomTarget.set(this.targetFor(pick.element));
    this.zoomPhase.set('in');
    this.afterZoom(this.reducedMotion() ? FADE_MS : ZOOM_MS, () => {
      this.zoom.set('book');
      this.zoomPhase.set('idle');
    });
  }

  /** Back out to the whole kingdom: the rooms fade, then the kingdom flies back. */
  leave(): void {
    if (this.zoomPhase() !== 'idle') {
      return;
    }

    this.audio.play('tap', 0.3);
    const reduced = this.reducedMotion();

    this.zoomPhase.set('leaving');
    this.afterZoom(reduced ? FADE_MS : LEAVE_MS, () => {
      const bookId = this.openBook()?.id;

      this.zoom.set('kingdom');
      this.openBook.set(null);
      this.chapters.set([]);
      this.zoomPhase.set('out');

      // The page has scrolled while inside the book, so the book's stop has
      // moved. Bring it back into view and fly out from there.
      afterNextRender(
        () => {
          const stop = bookId == null ? null : (this.map()?.scrollTo(bookId, 'instant') ?? null);
          const target = this.targetFor(stop);
          if (target) {
            this.zoomTarget.set(target);
          }
        },
        { injector: this.injector },
      );

      this.afterZoom(reduced ? FADE_MS : ZOOM_MS, () => {
        this.zoomPhase.set('idle');
        this.zoomTarget.set(null);
      });
    });
  }

  /** Open a room: a chapter's activities, or the reader at a page chapter. */
  openRoom(pick: LevelStopPick): void {
    const book = this.openBook();
    const room = this.rooms().find((r) => r.id === pick.stop.id);

    if (!room || room.state === 'locked' || !book) {
      return;
    }

    if (book.type === 'scanned') {
      this.router.navigate(['/student/read', book.id], { queryParams: { chapter: room.id } });
      return;
    }

    this.router.navigate(['/student/books', book.id, 'chapters', room.id]);
  }

  chapterState(chapter: ChapterNode): RoomState {
    if (chapter.is_locked) {
      return 'locked';
    }
    if (chapter.progress?.status === 'completed') {
      return 'completed';
    }
    if (chapter.progress?.status === 'in_progress') {
      return 'in-progress';
    }
    return 'pending';
  }

  /** How a book's progress should read: pages for a page book, chapters otherwise. */
  progressLabel(book: BookOverview): string {
    if (book.total_pages > 0) {
      return `${book.completed_pages} of ${book.total_pages} pages`;
    }

    if (book.total_chapters > 0) {
      return `${book.completed_chapters} of ${book.total_chapters} chapters`;
    }

    return 'Nothing to read yet';
  }

  private pageRoom(chapter: PageChapter, index: number): Room {
    const total = chapter.page_count;
    const done = Math.min(chapter.pages_completed, total);
    let state: RoomState = 'pending';

    if (total > 0 && done >= total) {
      state = 'completed';
    } else if (done > 0) {
      state = 'in-progress';
    }

    return {
      id: chapter.id,
      number: chapter.sequence || index + 1,
      title: chapter.title,
      state,
      pages: { done, total, percent: total > 0 ? Math.round((done / total) * 100) : 0 },
    };
  }

  /**
   * The transform that flies the tapped tower to the middle of the visible
   * part of the kingdom and magnifies it. Scaling about the tower's own centre
   * keeps it in place; the translate then carries it to the middle.
   */
  private targetFor(tower: HTMLElement | null): { transform: string; origin: string } | null {
    const world = this.kingdomEl()?.nativeElement;

    if (!tower || !world) {
      return null;
    }

    const box = world.getBoundingClientRect();
    const rect = tower.getBoundingClientRect();
    const towerX = rect.left + rect.width / 2;
    const towerY = rect.top + rect.height / 2;

    // Aim for the middle of what is on screen, not of the whole kingdom, which
    // may run below the fold on a small tablet.
    const top = Math.max(box.top, 0);
    const bottom = Math.min(box.bottom, window.innerHeight);
    const centreX = box.left + box.width / 2;
    const centreY = bottom > top ? (top + bottom) / 2 : box.top + box.height / 2;

    return {
      origin: `${towerX - box.left}px ${towerY - box.top}px`,
      transform: `translate(${centreX - towerX}px, ${centreY - towerY}px) scale(${ZOOM_SCALE})`,
    };
  }

  private reducedMotion(): boolean {
    return (
      typeof window !== 'undefined' &&
      !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    );
  }

  private afterZoom(ms: number, done: () => void): void {
    this.clearZoomTimer();
    this.zoomTimer = setTimeout(() => {
      this.zoomTimer = null;
      done();
    }, ms);
  }

  private clearZoomTimer(): void {
    if (this.zoomTimer) {
      clearTimeout(this.zoomTimer);
      this.zoomTimer = null;
    }
  }

  private stateFor(book: BookOverview, isCurrent: boolean): LevelStopLook {
    if (book.is_completed) {
      return 'completed';
    }
    if (book.is_locked) {
      return 'locked';
    }
    return isCurrent ? 'current' : 'available';
  }
}
