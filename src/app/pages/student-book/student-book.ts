import { Component, ElementRef, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ProgressService } from '../../services/progress/progress';
import { BookProgress, ChapterNode } from '../../models';
import { EmptyState, Spinner } from '../../shared/components';

type LevelState = 'locked' | 'current' | 'available' | 'completed';

interface LevelNode {
  chapter: ChapterNode;
  index: number;
  level: number;
  xPercent: number;
  yPx: number;
  state: LevelState;
}

const AMPLITUDE = 22;
const STEP = 180;
const TOP_PAD = 80;
const BOTTOM_PAD = 130;

@Component({
  selector: 'app-student-book',
  imports: [EmptyState, Spinner],
  templateUrl: './student-book.html',
  styleUrl: './student-book.scss',
})
export class StudentBook implements OnInit {
  private progressService = inject(ProgressService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private host = inject(ElementRef<HTMLElement>);

  readonly bookId = Number(this.route.snapshot.paramMap.get('bookId'));
  readonly book = signal<BookProgress | null>(null);
  readonly loading = signal(true);

  readonly chapters = computed<ChapterNode[]>(() => this.book()?.chapters ?? []);

  readonly levels = computed<LevelNode[]>(() => {
    const chapters = this.chapters();
    const count = chapters.length;
    const currentId = chapters.find(
      (chapter) => !chapter.is_locked && chapter.progress?.status !== 'completed',
    )?.id;

    return chapters.map((chapter, index) => ({
      chapter,
      index,
      level: chapter.chapter_number,
      xPercent: 50 + AMPLITUDE * Math.sin(index * 0.9 + 0.5),
      yPx: TOP_PAD + (count - 1 - index) * STEP,
      state: this.stateFor(chapter, chapter.id === currentId),
    }));
  });

  readonly worldHeight = computed(() => {
    const count = this.chapters().length;
    if (count === 0) {
      return 0;
    }
    return TOP_PAD + (count - 1) * STEP + BOTTOM_PAD;
  });

  readonly viewBox = computed(() => `0 0 100 ${this.worldHeight()}`);

  readonly trailPath = computed(() => {
    const points = this.levels();
    if (points.length === 0) {
      return '';
    }
    if (points.length === 1) {
      return `M ${points[0].xPercent} ${points[0].yPx}`;
    }

    let d = `M ${points[0].xPercent} ${points[0].yPx}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      d += ` Q ${prev.xPercent} ${prev.yPx} ${(prev.xPercent + curr.xPercent) / 2} ${(prev.yPx + curr.yPx) / 2}`;
    }
    const last = points[points.length - 1];
    d += ` L ${last.xPercent} ${last.yPx}`;
    return d;
  });

  ngOnInit(): void {
    this.progressService.book(this.bookId).subscribe({
      next: (response) => {
        this.book.set(response.data);
        this.loading.set(false);
        this.scrollToCurrent();
      },
      error: () => this.loading.set(false),
    });
  }

  /** Open the map at the player's current chapter (near the bottom). */
  private scrollToCurrent(): void {
    if (typeof window === 'undefined') {
      return;
    }
    requestAnimationFrame(() => {
      const current = this.host.nativeElement.querySelector('.spot--current');
      if (current) {
        current.scrollIntoView({ block: 'center', behavior: 'auto' });
      } else {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' });
      }
    });
  }

  private stateFor(chapter: ChapterNode, isCurrent: boolean): LevelState {
    if (chapter.progress?.status === 'completed') {
      return 'completed';
    }
    if (chapter.is_locked) {
      return 'locked';
    }
    return isCurrent ? 'current' : 'available';
  }

  open(chapter: ChapterNode): void {
    if (chapter.is_locked) {
      return;
    }
    this.router.navigate(['/student/books', this.bookId, 'chapters', chapter.id]);
  }

  back(): void {
    this.router.navigate(['/student/library']);
  }
}
