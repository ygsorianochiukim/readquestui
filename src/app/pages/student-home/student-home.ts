import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { StudentAuthService } from '../../services/student-auth/student-auth';
import { RewardService } from '../../services/reward/reward';
import { ProgressService } from '../../services/progress/progress';
import { AchievementService } from '../../services/achievement/achievement';
import { ReadingPlace, ReadingPlaceService } from '../../services/reading-place/reading-place';
import { Badge, BookOverview } from '../../models';
import { Spinner, Icon, Modal, StickerIcon } from '../../shared/components';

@Component({
  selector: 'app-student-home',
  imports: [Spinner, Icon, Modal, StickerIcon],
  templateUrl: './student-home.html',
  styleUrl: './student-home.scss',
})
export class StudentHome implements OnInit {
  private studentAuth = inject(StudentAuthService);
  private rewardService = inject(RewardService);
  private progressService = inject(ProgressService);
  private achievementService = inject(AchievementService);
  private router = inject(Router);
  private places = inject(ReadingPlaceService);

  readonly student = this.studentAuth.student;
  readonly badges = signal<Badge[]>([]);
  readonly points = signal(0);
  readonly books = signal<BookOverview[]>([]);
  readonly loading = signal(true);

  readonly achievementsUnlocked = signal(0);
  readonly achievementsTotal = signal(0);

  readonly firstName = computed(() => this.student()?.first_name ?? 'Reader');

  readonly overallPercent = computed(() => {
    const books = this.books();
    const total = books.reduce((sum, book) => sum + book.total_chapters, 0);
    const done = books.reduce((sum, book) => sum + book.completed_chapters, 0);
    return total > 0 ? Math.round((done / total) * 100) : 0;
  });

  /** Books open to read and not finished yet — the quests still going. */
  readonly openQuests = computed(
    () => this.books().filter((book) => !book.is_locked && !book.is_completed).length,
  );

  readonly completedBooks = computed(
    () => this.books().filter((book) => book.is_completed).length,
  );

  /** A playful "player level" derived from points (every 100 pts = 1 level). */
  readonly playerLevel = computed(() => Math.floor(this.points() / 100) + 1);

  /** This week's quest checklist — all derived from real progress data. */
  readonly quests = computed(() => {
    const books = this.books();
    const started = books.some((book) => book.percent > 0);
    return [
      { icon: 'book', label: 'Open a book', done: started },
      { icon: 'trophy', label: 'Finish a book', done: this.completedBooks() > 0 },
      { icon: 'star', label: 'Reach 100 points', done: this.points() >= 100 },
      { icon: 'badges', label: 'Earn a badge', done: this.badges().length > 0 },
    ];
  });

  readonly questsDone = computed(() => this.quests().filter((quest) => quest.done).length);

  /** The next book to work on: the first unlocked, not-yet-completed book. */
  readonly continueBook = computed(
    () => this.books().find((book) => !book.is_locked && !book.is_completed) ?? null,
  );

  ngOnInit(): void {
    if (!this.student()) {
      this.studentAuth.loadMe().subscribe({ error: () => {} });
    }

    this.rewardService.mine().subscribe({
      next: (summary) => {
        this.badges.set(summary.data);
        this.points.set(summary.points);
      },
      error: () => {},
    });

    this.progressService.overview().subscribe({
      next: (response) => {
        this.books.set(response.data);
        this.points.set(response.points);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    this.achievementService.mine().subscribe({
      next: (response) => {
        const summary = response.data;
        this.achievementsUnlocked.set(summary.unlocked);
        this.achievementsTotal.set(summary.total);
      },
      error: () => {},
    });
  }

  goAchievements(): void {
    this.router.navigate(['/student/achievements']);
  }

  openBook(book: BookOverview): void {
    if (book.is_locked) {
      return;
    }
    if (book.type === 'scanned') {
      this.router.navigate(['/student/read', book.id]);
    } else {
      this.router.navigate(['/student/books', book.id]);
    }
  }

  goLibrary(): void {
    this.router.navigate(['/student/library']);
  }

  /** Big "Play" button: jump into the current book, or the map if none. */
  enterWorld(): void {
    const book = this.continueBook();
    if (book) {
      this.openBook(book);
    } else {
      this.goLibrary();
    }
  }

  // ---- "Let's read!" ----

  readonly letsReadOpen = signal(false);

  /**
   * The page the child was last on, if its book is still theirs to read.
   * Read again whenever the student (and so the storage key) is known.
   */
  readonly lastPlace = computed<ReadingPlace | null>(() => {
    this.student();
    const place = this.places.last();
    const book = this.books().find((entry) => entry.id === place?.bookId);

    return place && book && !book.is_locked ? place : null;
  });

  /** The book "Let's read!" is about: where they stopped, else the next one to read. */
  readonly letsReadBook = computed(() => {
    const place = this.lastPlace();
    return (place && this.books().find((book) => book.id === place.bookId)) || this.continueBook();
  });

  openLetsRead(): void {
    if (!this.letsReadBook()) {
      this.goLibrary();
      return;
    }
    this.letsReadOpen.set(true);
  }

  /** Back to the very page they stopped on — or the next page they have not read. */
  continueReading(): void {
    const place = this.lastPlace();
    const book = this.letsReadBook();
    this.letsReadOpen.set(false);

    if (place) {
      if (place.kind === 'scanned') {
        this.router.navigate(['/student/read', place.bookId], {
          queryParams: { chapter: place.chapterId ?? undefined, page: place.page },
        });
      } else {
        this.router.navigate(['/student/books', place.bookId, 'chapters', place.chapterId], {
          queryParams: { page: place.page },
        });
      }
      return;
    }

    if (book?.type !== 'scanned' && book?.current_chapter_id) {
      this.router.navigate(['/student/books', book.id, 'chapters', book.current_chapter_id], {
        queryParams: { page: 'next' },
      });
    } else if (book) {
      this.openBook(book);
    }
  }

  /** The chapter they are on, from its first page. */
  startChapter(): void {
    const place = this.lastPlace();
    const book = this.letsReadBook();
    this.letsReadOpen.set(false);

    if (!book) {
      return;
    }

    if (book.type === 'scanned') {
      const chapterId = place?.chapterId ?? null;
      this.router.navigate(['/student/read', book.id], {
        queryParams: chapterId ? { chapter: chapterId } : {},
      });
      return;
    }

    const chapterId = (place?.bookId === book.id ? place.chapterId : null) ?? book.current_chapter_id;
    if (chapterId) {
      this.router.navigate(['/student/books', book.id, 'chapters', chapterId], {
        queryParams: { page: 1 },
      });
    } else {
      this.openBook(book);
    }
  }

  /** Pick any open chapter from the book's map. */
  pickChapter(): void {
    const book = this.letsReadBook();
    this.letsReadOpen.set(false);

    if (book) {
      this.openBook(book);
    }
  }
}
