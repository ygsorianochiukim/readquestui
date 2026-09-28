import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { IngestService } from '../../services/ingest/ingest';
import { BookPage, IngestBatch, IngestPreview, SuggestedChapter } from '../../models';
import { SuggestedPart } from '../../models/ingest/ingest.model';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Icon,
  PageHeader,
  ProgressBar,
  Spinner,
  StatusIndicator,
} from '../../shared/components';

/**
 * Uploading reading material.
 *
 * Teachers were typing books in by hand. Here they drop in a PDF or a stack of
 * page photos, watch it being read, correct anything the scanner got wrong, and
 * press publish. There is no "add a book" step before any of that — the book is
 * what comes out.
 */
@Component({
  selector: 'app-material-upload',
  imports: [
    FormsModule,
    Alert,
    Button,
    Card,
    EmptyState,
    Icon,
    PageHeader,
    ProgressBar,
    Spinner,
    StatusIndicator,
  ],
  templateUrl: './material-upload.html',
  styleUrl: './material-upload.scss',
})
export class MaterialUpload implements OnInit, OnDestroy {
  private ingest = inject(IngestService);
  private router = inject(Router);

  readonly loading = signal(true);
  readonly uploading = signal(false);
  readonly publishing = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly batches = signal<IngestBatch[]>([]);
  readonly canRenderPdfPages = signal(true);

  /** The upload currently open in the preview. */
  readonly preview = signal<IngestPreview | null>(null);

  // Publish form.
  readonly title = signal('');
  readonly readingLevel = signal('');
  readonly asChapters = signal(false);
  readonly chapters = signal<SuggestedChapter[]>([]);
  /** The picture-book grouping of pages into chapters (or parts). */
  readonly parts = signal<SuggestedPart[]>([]);

  /** The upload the publish form above was filled in for. */
  private formFilledFor: number | null = null;

  /** Set while a page is being read again. */
  readonly rescanningPageId = signal<number | null>(null);

  readonly dragging = signal(false);

  /** Set while a page's corrected text is being saved. */
  readonly savingPageId = signal<number | null>(null);

  private poller: ReturnType<typeof setInterval> | null = null;

  readonly batch = computed(() => this.preview()?.batch ?? null);
  readonly isReady = computed(() => this.batch()?.status === 'ready');
  readonly isWorking = computed(
    () => !!this.batch() && !this.batch()!.is_finished,
  );

  readonly pagesWithoutText = computed(
    () => this.preview()?.pages.filter((page) => !page.text?.trim()).length ?? 0,
  );

  ngOnInit(): void {
    this.refresh();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  refresh(): void {
    this.ingest.list().subscribe({
      next: (response) => {
        this.batches.set(response.data);
        this.canRenderPdfPages.set(response.meta.can_render_pdf_pages);
        this.loading.set(false);

        // Pick up an upload that was still running when the teacher left.
        const running = response.data.find((batch) => !batch.is_finished);
        if (running && !this.preview()) {
          this.watch(running.id);
        }
      },
      error: (response: HttpErrorResponse) => {
        this.errorMessage.set(response.error?.message ?? 'Could not load your uploads.');
        this.loading.set(false);
      },
    });
  }

  // ============================================================
  //  Uploading
  // ============================================================

  onFilesChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    input.value = '';

    this.upload(files);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);

    this.upload(Array.from(event.dataTransfer?.files ?? []));
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  onDragLeave(): void {
    this.dragging.set(false);
  }

  private upload(files: File[]): void {
    if (files.length === 0) {
      return;
    }

    this.errorMessage.set(null);
    this.uploading.set(true);

    this.ingest.start(files, this.title() || null).subscribe({
      next: (response) => {
        this.uploading.set(false);
        this.title.set('');
        this.watch(response.data.id);
        this.refresh();
      },
      error: (response: HttpErrorResponse) => {
        this.uploading.set(false);
        this.errorMessage.set(this.uploadError(response));
      },
    });
  }

  /**
   * Open an upload and, while it is still being read, keep asking how far it
   * has got. A forty-page PDF takes minutes, and a teacher staring at a frozen
   * screen assumes it has broken.
   */
  watch(batchId: number): void {
    this.stopPolling();
    this.load(batchId);

    this.poller = setInterval(() => this.load(batchId, true), 2000);
  }

  private load(batchId: number, quiet = false): void {
    this.ingest.show(batchId).subscribe({
      next: (response) => {
        const preview = response.data;
        this.preview.set(preview);

        if (preview.batch.is_finished) {
          this.stopPolling();
          this.refresh();
        }

        if (preview.batch.status === 'ready' && this.formFilledFor !== preview.batch.id) {
          this.formFilledFor = preview.batch.id;
          this.chapters.set(preview.suggested_chapters);
          this.parts.set(preview.suggested_parts ?? []);
          this.title.set(preview.suggested_title ?? preview.book?.title ?? '');
          this.readingLevel.set(preview.book?.reading_level ?? '');
          this.asChapters.set(this.looksLikeReader(preview));
        }
      },
      error: (response: HttpErrorResponse) => {
        this.stopPolling();

        if (!quiet) {
          this.errorMessage.set(response.error?.message ?? 'Could not open that upload.');
        }
      },
    });
  }

  private stopPolling(): void {
    if (this.poller) {
      clearInterval(this.poller);
      this.poller = null;
    }
  }

  // ============================================================
  //  Preview
  // ============================================================

  /** Correct what the scanner misread. */
  savePageText(pageId: number, text: string): void {
    const batch = this.batch();

    if (!batch) {
      return;
    }

    this.savingPageId.set(pageId);

    this.ingest.updatePage(batch.id, pageId, text).subscribe({
      next: () => {
        this.savingPageId.set(null);
        this.preview.update((preview) =>
          preview
            ? {
                ...preview,
                pages: preview.pages.map((page) =>
                  page.id === pageId ? { ...page, text } : page,
                ),
              }
            : preview,
        );
      },
      error: () => {
        this.savingPageId.set(null);
        this.errorMessage.set('Could not save that page. Please try again.');
      },
    });
  }

  onPageTextChange(pageId: number, event: Event): void {
    this.savePageText(pageId, (event.target as HTMLTextAreaElement).value);
  }

  updateChapterTitle(index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;

    this.chapters.update((chapters) =>
      chapters.map((chapter, position) =>
        position === index ? { ...chapter, title: value } : chapter,
      ),
    );
  }

  updatePartTitle(index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;

    this.parts.update((parts) =>
      parts.map((part, position) => (position === index ? { ...part, title: value } : part)),
    );
  }

  /** "3–10" for a run of pages, rather than listing every number. */
  pageRange(pageNumbers: number[]): string {
    if (pageNumbers.length <= 2) {
      return pageNumbers.join(', ');
    }

    return `${pageNumbers[0]}–${pageNumbers[pageNumbers.length - 1]}`;
  }

  /** Read a page again from the picture already uploaded. */
  rescanPage(pageId: number): void {
    this.runRescan(pageId, null);
  }

  /** Swap a blurry or cropped page for a new photo, and read that. */
  onReplacePhoto(pageId: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';

    if (file) {
      this.runRescan(pageId, file);
    }
  }

  private runRescan(pageId: number, image: File | null): void {
    const batch = this.batch();

    if (!batch) {
      return;
    }

    this.rescanningPageId.set(pageId);
    this.errorMessage.set(null);

    this.ingest.rescanPage(batch.id, pageId, image).subscribe({
      next: (response) => {
        this.rescanningPageId.set(null);
        this.replacePage(response.data);

        if (!response.data.text?.trim()) {
          this.errorMessage.set(
            `No words were found on page ${response.data.page_number}. If it has words, try a clearer, straighter photo.`,
          );
        }
      },
      error: (response: HttpErrorResponse) => {
        this.rescanningPageId.set(null);
        this.errorMessage.set(response.error?.message ?? 'Could not read that page again. Please try again.');
      },
    });
  }

  private replacePage(updated: BookPage): void {
    this.preview.update((preview) =>
      preview
        ? { ...preview, pages: preview.pages.map((page) => (page.id === updated.id ? updated : page)) }
        : preview,
    );
  }

  /**
   * Suggest a chapter reader when the pages carry real prose — chapter
   * headings, or plenty of words per page. Mostly-picture pages suggest a
   * picture book. Suggest, do not decide: the teacher can switch.
   */
  private looksLikeReader(preview: IngestPreview): boolean {
    if (preview.suggested_chapters.length > 1) {
      return true;
    }

    const words = preview.pages.map((page) => (page.text?.trim() ? page.text.trim().split(/\s+/).length : 0));
    const total = words.reduce((sum, count) => sum + count, 0);

    return words.length > 0 && total / words.length >= 60;
  }

  removeChapter(index: number): void {
    this.chapters.update((chapters) =>
      chapters
        .filter((_, position) => position !== index)
        .map((chapter, position) => ({ ...chapter, chapter_number: position + 1 })),
    );
  }

  /** Publish it — this is the point the book becomes assignable. */
  publish(): void {
    const batch = this.batch();

    if (!batch) {
      return;
    }

    this.publishing.set(true);
    this.errorMessage.set(null);

    this.ingest
      .commit(batch.id, {
        title: this.title() || null,
        readingLevel: this.readingLevel() || null,
        asChapters: this.asChapters(),
        chapters: this.asChapters() ? this.chapters() : null,
        parts: this.asChapters() ? null : this.parts(),
      })
      .subscribe({
        next: (response) => {
          this.publishing.set(false);
          this.preview.set(null);
          this.chapters.set([]);
          this.formFilledFor = null;
          this.router.navigate(['/dashboard/books'], {
            queryParams: { published: response.data.id },
          });
        },
        error: (response: HttpErrorResponse) => {
          this.publishing.set(false);
          this.errorMessage.set(response.error?.message ?? 'Could not publish this book.');
        },
      });
  }

  discard(): void {
    const batch = this.batch();

    if (!batch) {
      return;
    }

    this.ingest.discard(batch.id).subscribe({
      next: () => {
        this.preview.set(null);
        this.chapters.set([]);
        this.formFilledFor = null;
        this.refresh();
      },
      error: () => this.errorMessage.set('Could not discard that upload.'),
    });
  }

  close(): void {
    this.stopPolling();
    this.preview.set(null);
    this.chapters.set([]);
    this.formFilledFor = null;
  }

  batchStatus(batch: IngestBatch): 'completed' | 'failed' | 'loading' | 'pending' {
    switch (batch.status) {
      case 'committed':
        return 'completed';
      case 'failed':
        return 'failed';
      case 'ready':
        return 'pending';
      default:
        return 'loading';
    }
  }

  private uploadError(response: HttpErrorResponse): string {
    const errors = response.error?.errors;

    if (errors) {
      const first = Object.values(errors)[0];
      if (Array.isArray(first) && first.length) {
        return String(first[0]);
      }
    }

    return response.error?.message ?? 'Could not upload that file. Please try again.';
  }
}
