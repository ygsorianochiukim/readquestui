import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import {
  PronunciationService,
  ReviewQueueFilters,
} from '../../services/pronunciation/pronunciation';
import { StudentService } from '../../services/student/student';
import { PronunciationAttempt, PronunciationWord, Student } from '../../models';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Icon,
  PageHeader,
  Spinner,
  StatusIndicator,
} from '../../shared/components';

/**
 * The teacher's read-aloud review queue.
 *
 * Manual verification was an API endpoint with nothing calling it. This is the
 * screen it was waiting for: every reading a teacher's class has recorded, the
 * words each child got wrong, the recording itself, and one place to overrule
 * a score the machine got wrong.
 */
@Component({
  selector: 'app-pronunciation-review',
  imports: [
    DecimalPipe,
    FormsModule,
    RouterLink,
    Alert,
    Button,
    Card,
    EmptyState,
    Icon,
    PageHeader,
    Spinner,
    StatusIndicator,
  ],
  templateUrl: './pronunciation-review.html',
  styleUrl: './pronunciation-review.scss',
})
export class PronunciationReview implements OnInit {
  private service = inject(PronunciationService);
  private students = inject(StudentService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly attempts = signal<PronunciationAttempt[]>([]);
  readonly roster = signal<Student[]>([]);
  readonly pendingCount = signal(0);
  readonly currentPage = signal(1);
  readonly lastPage = signal(1);

  // Filters
  readonly studentFilter = signal<number | null>(null);
  readonly statusFilter = signal<'pending' | 'reviewed' | ''>('pending');
  readonly onlyFailed = signal(false);

  /** The attempt open in the detail panel. */
  readonly selected = signal<PronunciationAttempt | null>(null);
  readonly detailLoading = signal(false);

  // The override form, kept out of the attempt itself so a half-typed score
  // never looks like a saved one.
  readonly overrideScore = signal<number | null>(null);
  readonly overrideNote = signal('');

  readonly hasMore = computed(() => this.currentPage() < this.lastPage());

  /** The words this child got wrong in the open attempt. */
  readonly missedWords = computed(
    () => this.selected()?.words?.filter((word) => word.error_type !== 'None') ?? [],
  );

  ngOnInit(): void {
    this.students.list().subscribe({
      next: (response) => this.roster.set(response.data),
      error: () => this.roster.set([]),
    });

    this.load();
  }

  load(page = 1): void {
    this.loading.set(true);

    const filters: ReviewQueueFilters = { page };

    if (this.studentFilter()) {
      filters.studentId = this.studentFilter()!;
    }
    if (this.statusFilter()) {
      filters.status = this.statusFilter() as 'pending' | 'reviewed';
    }
    if (this.onlyFailed()) {
      filters.onlyFailed = true;
    }

    this.service.queue(filters).subscribe({
      next: (response) => {
        this.attempts.set(response.data);
        this.pendingCount.set(response.meta.pending);
        this.currentPage.set(response.meta.current_page);
        this.lastPage.set(response.meta.last_page);
        this.loading.set(false);
      },
      error: (response: HttpErrorResponse) => {
        this.errorMessage.set(response.error?.message ?? 'Could not load the review queue.');
        this.loading.set(false);
      },
    });
  }

  applyFilters(): void {
    this.selected.set(null);
    this.load(1);
  }

  nextPage(): void {
    if (this.hasMore()) {
      this.load(this.currentPage() + 1);
    }
  }

  /** Open one reading in full — every word, and the recording. */
  open(attempt: PronunciationAttempt): void {
    this.detailLoading.set(true);
    this.selected.set(attempt);
    this.overrideScore.set(attempt.teacher_score);
    this.overrideNote.set(attempt.teacher_note ?? '');

    this.service.review(attempt.id).subscribe({
      next: (response) => {
        this.selected.set(response.data);
        this.detailLoading.set(false);
      },
      error: () => this.detailLoading.set(false),
    });
  }

  close(): void {
    this.selected.set(null);
  }

  /** Confirm the machine got it right. */
  confirm(attempt: PronunciationAttempt): void {
    this.saving.set(true);

    this.service.validate(attempt.id).subscribe({
      next: (response) => {
        this.replace(response.data);
        this.saving.set(false);
      },
      error: (response: HttpErrorResponse) => {
        this.errorMessage.set(response.error?.message ?? 'Could not save that.');
        this.saving.set(false);
      },
    });
  }

  /** Replace the machine's score with the teacher's own. */
  saveOverride(): void {
    const attempt = this.selected();

    if (!attempt) {
      return;
    }

    const score = this.overrideScore();

    if (score !== null && (score < 0 || score > 100)) {
      this.errorMessage.set('A reading score must be between 0 and 100.');
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);

    this.service.override(attempt.id, score, this.overrideNote() || null).subscribe({
      next: (response) => {
        this.replace(response.data);
        this.selected.set(response.data);
        this.saving.set(false);
      },
      error: (response: HttpErrorResponse) => {
        this.errorMessage.set(
          response.error?.message ?? 'Could not save your score. Please try again.',
        );
        this.saving.set(false);
      },
    });
  }

  /** Withdraw an override and let the automatic score stand again. */
  clearOverride(): void {
    this.overrideScore.set(null);
    this.overrideNote.set('');
    this.saveOverride();
  }

  studentName(attempt: PronunciationAttempt): string {
    return attempt.student
      ? `${attempt.student.first_name} ${attempt.student.last_name}`
      : 'Unknown pupil';
  }

  /** What the child was reading, in a form a teacher can place. */
  source(attempt: PronunciationAttempt): string {
    if (attempt.chapter) {
      return `Chapter ${attempt.chapter.chapter_number}: ${attempt.chapter.title}`;
    }
    if (attempt.book_page) {
      return `Page ${attempt.book_page.page_number}`;
    }
    return 'Reading';
  }

  reviewState(attempt: PronunciationAttempt): 'passed' | 'failed' | 'pending' {
    if (!attempt.is_validated && attempt.teacher_score === null) {
      return 'pending';
    }
    return attempt.passed ? 'passed' : 'failed';
  }

  /** How a single word should be shown in the detail panel. */
  wordClass(word: PronunciationWord): string {
    switch (word.error_type) {
      case 'None':
        return 'correct';
      case 'Omission':
        return 'omitted';
      default:
        return 'incorrect';
    }
  }

  /** Hover text for a word: Azure's verdict, and the retry if there was one. */
  wordTitle(word: PronunciationWord): string {
    let title =
      word.accuracy_score === null
        ? word.error_type
        : `${word.error_type} · ${Math.round(word.accuracy_score)}%`;

    if (word.retry_accuracy !== null && word.retry_accuracy !== undefined) {
      title += ` · retried: ${Math.round(word.retry_accuracy)}%${word.is_corrected ? ' (corrected)' : ''}`;
    }

    return title;
  }

  private replace(updated: PronunciationAttempt): void {
    this.attempts.update((attempts) =>
      attempts.map((attempt) =>
        attempt.id === updated.id ? { ...attempt, ...updated } : attempt,
      ),
    );

    // A confirmed reading leaves the pending count behind it.
    this.pendingCount.update((count) => Math.max(0, count - 1));
  }
}
