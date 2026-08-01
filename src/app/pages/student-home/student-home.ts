import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { StudentAuthService } from '../../services/student-auth/student-auth';
import { RewardService } from '../../services/reward/reward';
import { ProgressService } from '../../services/progress/progress';
import { Badge, BookOverview } from '../../models';
import { Button, Spinner } from '../../shared/components';

@Component({
  selector: 'app-student-home',
  imports: [Button, Spinner],
  templateUrl: './student-home.html',
  styleUrl: './student-home.scss',
})
export class StudentHome implements OnInit {
  private studentAuth = inject(StudentAuthService);
  private rewardService = inject(RewardService);
  private progressService = inject(ProgressService);
  private router = inject(Router);

  readonly student = this.studentAuth.student;
  readonly badges = signal<Badge[]>([]);
  readonly points = signal(0);
  readonly books = signal<BookOverview[]>([]);
  readonly loading = signal(true);

  readonly firstName = computed(() => this.student()?.first_name ?? 'Reader');

  readonly overallPercent = computed(() => {
    const books = this.books();
    const total = books.reduce((sum, book) => sum + book.total_chapters, 0);
    const done = books.reduce((sum, book) => sum + book.completed_chapters, 0);
    return total > 0 ? Math.round((done / total) * 100) : 0;
  });

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
      { icon: '📖', label: 'Open a book', done: started },
      { icon: '🏆', label: 'Finish a book', done: this.completedBooks() > 0 },
      { icon: '⭐', label: 'Reach 100 points', done: this.points() >= 100 },
      { icon: '🏅', label: 'Earn a badge', done: this.badges().length > 0 },
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
}
