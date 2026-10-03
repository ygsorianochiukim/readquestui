import { Injectable, inject } from '@angular/core';
import { StudentAuthService } from '../student-auth/student-auth';

/** Where a child stopped reading: enough to put them back on that page. */
export interface ReadingPlace {
  bookId: number;
  bookTitle: string;
  /** A chapter book: read on the chapter screen, a page at a time. */
  kind: 'chapter' | 'scanned';
  chapterId: number | null;
  chapterTitle: string | null;
  /** Chapter books: the page's place in the chapter, from 1. Page books: the page's id. */
  page: number;
  /** "Page 3 of 8", for the button that takes them back. */
  pageLabel: string;
  savedAt: number;
}

/**
 * Remembers the page a child was last on, so "Let's read!" can take them
 * straight back to it. Kept on this device per child; the home screen falls
 * back to the server's progress when there is nothing here.
 */
@Injectable({ providedIn: 'root' })
export class ReadingPlaceService {
  private studentAuth = inject(StudentAuthService);

  remember(place: Omit<ReadingPlace, 'savedAt'>): void {
    const key = this.key();
    if (!key) {
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify({ ...place, savedAt: Date.now() }));
    } catch {
      /* storage blocked: resuming just falls back to the server's progress */
    }
  }

  last(): ReadingPlace | null {
    const key = this.key();
    if (!key) {
      return null;
    }
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as ReadingPlace) : null;
    } catch {
      return null;
    }
  }

  forget(): void {
    const key = this.key();
    try {
      if (key) {
        localStorage.removeItem(key);
      }
    } catch {
      /* nothing to forget */
    }
  }

  private key(): string | null {
    const id = this.studentAuth.student()?.id;
    return id ? `rq:reading-place:${id}` : null;
  }
}
