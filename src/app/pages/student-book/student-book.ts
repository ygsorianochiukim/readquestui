import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AudioService } from '../../services/audio/audio';
import { ProgressService } from '../../services/progress/progress';
import { ThemeService } from '../../services/theme/theme';
import { BookProgress, ChapterNode } from '../../models';
import {
  EmptyState,
  Icon,
  LevelMap,
  LevelStop,
  LevelStopLook,
  ProgressBar,
  Spinner,
} from '../../shared/components';

/**
 * Inside one book: its chapters as a winding level map, chapter 1 at the
 * bottom — the same map the kingdom zooms into.
 */
@Component({
  selector: 'app-student-book',
  imports: [EmptyState, Icon, LevelMap, ProgressBar, Spinner],
  templateUrl: './student-book.html',
  styleUrl: './student-book.scss',
})
export class StudentBook implements OnInit, OnDestroy {
  private progressService = inject(ProgressService);
  private audio = inject(AudioService);
  private themes = inject(ThemeService);
  /** The reading theme, so the map is painted in it too. */
  readonly theme = this.themes.active;
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly bookId = Number(this.route.snapshot.paramMap.get('bookId'));
  readonly book = signal<BookProgress | null>(null);
  readonly loading = signal(true);

  readonly chapters = computed<ChapterNode[]>(() => this.book()?.chapters ?? []);

  /** The chapter the child is up to — the one the header points at. */
  readonly currentChapter = computed(
    () =>
      this.chapters().find(
        (chapter) => !chapter.is_locked && chapter.progress?.status !== 'completed',
      ) ?? null,
  );

  readonly completedCount = computed(
    () => this.chapters().filter((chapter) => chapter.progress?.status === 'completed').length,
  );

  readonly percent = computed(() => {
    const total = this.chapters().length;

    return total === 0 ? 0 : Math.round((this.completedCount() / total) * 100);
  });

  /** The chapters as stops on the book's level map, chapter 1 at the bottom. */
  readonly stops = computed<LevelStop[]>(() => {
    const currentId = this.currentChapter()?.id;

    return this.chapters().map((chapter) => {
      const look = this.stateFor(chapter, chapter.id === currentId);
      return {
        id: chapter.id,
        number: chapter.chapter_number,
        title: chapter.title,
        look,
        meta:
          chapter.has_quiz && look !== 'locked'
            ? 'Has a quiz'
            : look === 'current'
              ? 'Up next'
              : undefined,
        label: `Chapter ${chapter.chapter_number}: ${chapter.title}`,
      };
    });
  });

  readonly isFinished = computed(
    () => this.chapters().length > 0 && this.completedCount() === this.chapters().length,
  );

  ngOnInit(): void {
    this.progressService.book(this.bookId).subscribe({
      next: (response) => {
        this.book.set(response.data);
        this.themes.use(response.data.theme);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  ngOnDestroy(): void {
    this.themes.clear();
  }

  private stateFor(chapter: ChapterNode, isCurrent: boolean): LevelStopLook {
    if (chapter.progress?.status === 'completed') {
      return 'completed';
    }
    if (chapter.is_locked) {
      return 'locked';
    }
    return isCurrent ? 'current' : 'available';
  }

  open(chapterId: number): void {
    const chapter = this.chapters().find((c) => c.id === chapterId);
    if (!chapter || chapter.is_locked) {
      return;
    }

    this.audio.play('tap', 0.4);
    this.router.navigate(['/student/books', this.bookId, 'chapters', chapter.id]);
  }

  back(): void {
    this.router.navigate(['/student/library']);
  }
}
