import { Component, ElementRef, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ProgressService } from '../../services/progress/progress';
import { BookOverview } from '../../models';
import { EmptyState, Spinner } from '../../shared/components';

type LevelState = 'locked' | 'current' | 'available' | 'completed';

/** A book placed as a "level" on the winding adventure map. */
interface MapLevel {
  book: BookOverview;
  index: number;
  level: number;
  xPercent: number; // horizontal position of the node centre (0–100 %)
  yPx: number; // vertical position of the node centre (px)
  state: LevelState;
}

// Generous spacing so levels are never squeezed — the world just gets taller
// and scrolls, matching the map artwork at its natural size.
const AMPLITUDE = 22; // how far the path swings left/right (%)
const STEP = 180; // vertical gap between levels (px)
const TOP_PAD = 80;
const BOTTOM_PAD = 130;

@Component({
  selector: 'app-student-library',
  imports: [EmptyState, Spinner],
  templateUrl: './student-library.html',
  styleUrl: './student-library.scss',
})
export class StudentLibrary implements OnInit {
  private progressService = inject(ProgressService);
  private router = inject(Router);
  private host = inject(ElementRef<HTMLElement>);

  readonly books = signal<BookOverview[]>([]);
  readonly loading = signal(true);

  /** Books laid out as nodes up the winding path — Level 1 at the bottom. */
  readonly levels = computed<MapLevel[]>(() => {
    const books = this.books();
    const count = books.length;
    const currentId = books.find((book) => !book.is_locked && !book.is_completed)?.id;

    return books.map((book, index) => ({
      book,
      index,
      level: book.sequence || index + 1,
      xPercent: 50 + AMPLITUDE * Math.sin(index * 0.9 + 0.5),
      yPx: TOP_PAD + (count - 1 - index) * STEP,
      state: this.stateFor(book, book.id === currentId),
    }));
  });

  /** Total height of the scrollable world. */
  readonly worldHeight = computed(() => {
    const count = this.books().length;
    if (count === 0) {
      return 0;
    }
    return TOP_PAD + (count - 1) * STEP + BOTTOM_PAD;
  });

  readonly viewBox = computed(() => `0 0 100 ${this.worldHeight()}`);

  /** A smooth curved trail connecting the level nodes in order. */
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

  private stateFor(book: BookOverview, isCurrent: boolean): LevelState {
    if (book.is_completed) {
      return 'completed';
    }
    if (book.is_locked) {
      return 'locked';
    }
    return isCurrent ? 'current' : 'available';
  }

  ngOnInit(): void {
    this.progressService.overview().subscribe({
      next: (response) => {
        this.books.set(response.data);
        this.loading.set(false);
        this.scrollToCurrent();
      },
      error: () => this.loading.set(false),
    });
  }

  /** Open the map at the player's current level (near the bottom). */
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

  open(book: BookOverview): void {
    if (book.is_locked) {
      return;
    }
    if (book.type === 'scanned') {
      this.router.navigate(['/student/read', book.id]);
    } else {
      this.router.navigate(['/student/books', book.id]);
    }
  }
}
