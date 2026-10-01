import { Injectable, computed, inject, signal } from '@angular/core';
import { ReadingTheme, ThemeKey, themeFor } from '../../models/theme/theme.model';
import { AudioService } from '../audio/audio';

/**
 * The theme the child is reading in right now.
 *
 * A reading screen says which book (and chapter) is open; the student shell
 * paints its world in that theme, and the background music changes key to
 * match — without stopping, so it plays on from screen to screen.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private audio = inject(AudioService);

  private readonly key = signal<ThemeKey | null>(null);

  readonly active = computed<ReadingTheme | null>(() => themeFor(this.key()));

  /** A chapter's own theme wins over its book's; neither means the default world. */
  use(bookTheme: ThemeKey | null | undefined, chapterTheme?: ThemeKey | null): void {
    const theme = themeFor(chapterTheme) ?? themeFor(bookTheme);
    this.key.set(theme?.key ?? null);
    this.audio.setMood(theme?.key ?? null);
  }

  clear(): void {
    this.use(null);
  }
}
