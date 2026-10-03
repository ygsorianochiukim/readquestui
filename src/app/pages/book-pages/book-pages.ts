import { afterNextRender, Component, computed, inject, Injector, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { BookPageService } from '../../services/book-page/book-page';
import { NarrationService } from '../../services/narration/narration';
import { BookPage } from '../../models';
import { BookPageChapter } from '../../models/book-page/book-page.model';
import { Alert, Button, EmptyState, Spinner, Icon } from '../../shared/components';

/** One chapter and the pages in it, as shown on the page list. */
interface PageGroup {
  key: string;
  chapter: BookPageChapter | null;
  pages: BookPage[];
}

/**
 * A book's pages, grouped under the chapters they belong to
 * (Book → Chapters → Pages). Pages are added by uploading them into a
 * chapter; a page that read badly is scanned again rather than retyped.
 */
@Component({
  selector: 'app-book-pages',
  imports: [FormsModule, RouterLink, Alert, Button, EmptyState, Spinner, Icon],
  templateUrl: './book-pages.html',
  styleUrl: './book-pages.scss',
})
export class BookPages implements OnInit {
  private pageService = inject(BookPageService);
  private narrationService = inject(NarrationService);
  private route = inject(ActivatedRoute);
  private injector = inject(Injector);

  /** Arriving from a chapter's "Pages" link, jump to that chapter once — not on every reload. */
  private pendingFragment = this.route.snapshot.fragment;

  readonly bookId = Number(this.route.snapshot.paramMap.get('bookId'));
  readonly pages = signal<BookPage[]>([]);
  readonly chapters = signal<BookPageChapter[]>([]);
  readonly loading = signal(true);
  readonly uploading = signal(false);
  readonly uploadProgress = signal('');
  readonly savingPageId = signal<number | null>(null);
  readonly rescanningPageId = signal<number | null>(null);
  readonly errorMessage = signal<string | null>(null);

  /** The chapter the next upload goes into (null: the book's last chapter). */
  private uploadChapterId: number | null = null;

  /** Every chapter with its pages, in order; stray pages (if any) last. */
  readonly groups = computed<PageGroup[]>(() => {
    const pages = this.pages();
    const groups: PageGroup[] = this.chapters().map((chapter) => ({
      key: `chapter-${chapter.id}`,
      chapter,
      pages: pages.filter((page) => page.chapter_id === chapter.id),
    }));

    const known = new Set(this.chapters().map((chapter) => chapter.id));
    const stray = pages.filter((page) => page.chapter_id === null || !known.has(page.chapter_id));
    if (stray.length) {
      groups.push({ key: 'unsorted', chapter: null, pages: stray });
    }

    return groups;
  });

  // Narration playback
  readonly activeNarrationId = signal<number | null>(null);
  readonly narrationLoading = signal(false);
  private audio: HTMLAudioElement | null = null;

  ngOnInit(): void {
    this.loadPages();
  }

  loadPages(): void {
    this.loading.set(true);
    this.pageService.listForBook(this.bookId).subscribe({
      next: (response) => {
        this.pages.set(response.data);
        this.chapters.set(response.chapters ?? []);
        this.loading.set(false);
        this.scrollToFragment();
      },
      error: (response) => {
        this.errorMessage.set(this.readError(response));
        this.loading.set(false);
      },
    });
  }

  /** The pages arrive after the router has already tried to scroll, so do it here. */
  private scrollToFragment(): void {
    const fragment = this.pendingFragment;
    this.pendingFragment = null;

    if (!fragment) {
      return;
    }

    afterNextRender(
      () => document.getElementById(fragment)?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
      { injector: this.injector },
    );
  }

  /** Open the file picker for pages that go into the given chapter. */
  chooseFiles(chapterId: number | null, input: HTMLInputElement): void {
    this.uploadChapterId = chapterId;
    input.click();
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    input.value = '';
    if (files.length) {
      this.errorMessage.set(null);
      this.uploadNext(files, 0);
    }
  }

  private uploadNext(files: File[], index: number): void {
    if (index >= files.length) {
      this.uploading.set(false);
      this.uploadProgress.set('');
      this.loadPages();
      return;
    }
    this.uploading.set(true);
    this.uploadProgress.set(`Uploading & reading page ${index + 1} of ${files.length}…`);
    this.pageService.upload(this.bookId, files[index], this.uploadChapterId).subscribe({
      next: () => this.uploadNext(files, index + 1),
      error: (response) => {
        this.uploading.set(false);
        this.uploadProgress.set('');
        this.errorMessage.set(this.readError(response));
      },
    });
  }

  // ---- Pages without a scan: typed in, or cut from the chapter's story ----

  /** The chapter a page is being typed into; null when none is. */
  readonly typingChapterId = signal<number | null>(null);
  readonly draftText = signal('');
  readonly savingDraft = signal(false);
  readonly generatingChapterId = signal<number | null>(null);
  /** How many sentences go on each generated page. */
  readonly sentencesPerPage = signal(5);

  startTyping(chapterId: number): void {
    this.typingChapterId.set(chapterId);
    this.draftText.set('');
  }

  cancelTyping(): void {
    this.typingChapterId.set(null);
    this.draftText.set('');
  }

  saveDraft(): void {
    const chapterId = this.typingChapterId();
    const text = this.draftText().trim();

    if (!chapterId || !text) {
      return;
    }

    this.savingDraft.set(true);
    this.errorMessage.set(null);
    this.pageService.addText(this.bookId, chapterId, text).subscribe({
      next: (response) => {
        this.savingDraft.set(false);
        this.cancelTyping();
        this.pages.update((pages) => [...pages, response.data]);
      },
      error: (response: HttpErrorResponse) => {
        this.savingDraft.set(false);
        this.errorMessage.set(this.readError(response));
      },
    });
  }

  /** Make the chapter's pages from its story text. */
  generatePages(chapter: BookPageChapter): void {
    this.generatingChapterId.set(chapter.id);
    this.errorMessage.set(null);
    this.pageService.generate(chapter.id, this.sentencesPerPage()).subscribe({
      next: (response) => {
        this.generatingChapterId.set(null);
        this.pages.update((pages) => [...pages, ...response.data]);
      },
      error: (response: HttpErrorResponse) => {
        this.generatingChapterId.set(null);
        this.errorMessage.set(this.readError(response));
      },
    });
  }

  saveText(page: BookPage): void {
    this.savingPageId.set(page.id);
    this.errorMessage.set(null);
    this.pageService.updateText(page.id, page.text ?? '').subscribe({
      next: () => this.savingPageId.set(null),
      error: (response) => {
        this.savingPageId.set(null);
        this.errorMessage.set(this.readError(response));
      },
    });
  }

  /** Read a page again: from a replacement photo if given, else its own. */
  rescan(page: BookPage, image: File | null): void {
    this.rescanningPageId.set(page.id);
    this.errorMessage.set(null);
    this.pageService.rescan(page.id, image).subscribe({
      next: (response) => {
        this.rescanningPageId.set(null);
        this.pages.update((pages) => pages.map((item) => (item.id === page.id ? response.data : item)));
        if (!response.data.text?.trim()) {
          this.errorMessage.set(`No words were found on page ${page.page_number}. If it has words, try a clearer photo.`);
        }
      },
      error: (response: HttpErrorResponse) => {
        this.rescanningPageId.set(null);
        this.errorMessage.set(this.readError(response));
      },
    });
  }

  onReplacePhoto(page: BookPage, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (file) {
      this.rescan(page, file);
    }
  }

  deletePage(page: BookPage): void {
    if (!confirm(`Delete page ${page.page_number}?`)) {
      return;
    }
    this.pageService.remove(page.id).subscribe({
      next: () => this.loadPages(),
      error: (response) => this.errorMessage.set(this.readError(response)),
    });
  }

  playNarration(page: BookPage): void {
    if (this.activeNarrationId() === page.id) {
      this.stopNarration();
      return;
    }
    this.stopNarration();

    if (!page.text) {
      this.errorMessage.set('This page has no text to narrate yet.');
      return;
    }

    this.errorMessage.set(null);
    this.activeNarrationId.set(page.id);
    this.narrationLoading.set(true);

    this.narrationService.getPageNarration(page.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        this.audio = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          this.activeNarrationId.set(null);
        };
        audio.play();
        this.narrationLoading.set(false);
      },
      error: (response: HttpErrorResponse) => {
        this.activeNarrationId.set(null);
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
    this.activeNarrationId.set(null);
  }

  private narrationError(status: number): string {
    switch (status) {
      case 503:
        return 'Text-to-Speech is not set up yet. Add the Azure Speech key and region to the API .env file.';
      case 422:
        return 'This page has no text to narrate yet.';
      case 502:
        return 'Could not generate narration. Please check the Azure Speech credentials.';
      default:
        return 'Could not play narration. Please try again.';
    }
  }

  private readError(response: HttpErrorResponse): string {
    if (response.error?.errors) {
      const firstError = Object.values(response.error.errors)[0];
      if (Array.isArray(firstError)) {
        return firstError[0] as string;
      }
    }
    return response.error?.message ?? 'Request failed. Please try again.';
  }
}
