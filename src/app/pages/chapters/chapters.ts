import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChapterClassProgress,
  ChapterPayload,
  ChapterService,
} from '../../services/chapter/chapter';
import { BookService } from '../../services/book/book';
import { NarrationService } from '../../services/narration/narration';
import { UploadService } from '../../services/upload/upload';
import { Book, Chapter } from '../../models';
import {
  Alert,
  Button,
  EmptyState,
  FormField,
  Modal,
  ProgressBar,
  Spinner,
  Icon,
  ThemePicker,
} from '../../shared/components';

/**
 * A book's chapters. Every book has them — a reader's chapters carry story
 * text and a quiz, a picture book's chapters group its pages.
 *
 * A chapter is added by uploading its printed pages, never by typing it. The
 * only text a teacher touches is a fix to something the scanner misread.
 */
@Component({
  selector: 'app-chapters',
  imports: [
    FormsModule,
    RouterLink,
    Alert,
    Button,
    EmptyState,
    FormField,
    Modal,
    ProgressBar,
    Spinner,
    Icon,
    ThemePicker,
  ],
  templateUrl: './chapters.html',
  styleUrl: './chapters.scss',
})
export class Chapters implements OnInit {
  private chapterService = inject(ChapterService);
  private bookService = inject(BookService);
  private narrationService = inject(NarrationService);
  private uploadService = inject(UploadService);
  private route = inject(ActivatedRoute);

  readonly imageUploading = signal(false);

  // ---- Adding a chapter by uploading its pages ----
  readonly isUploadOpen = signal(false);
  readonly uploading = signal(false);
  readonly uploadFiles = signal<File[]>([]);
  uploadTitle = '';

  // ---- Narration (Azure TTS) playback ----
  readonly activeNarrationId = signal<number | null>(null);
  readonly narrationLoading = signal(false);
  private audio: HTMLAudioElement | null = null;

  readonly bookId = Number(this.route.snapshot.paramMap.get('bookId'));
  readonly book = signal<Book | null>(null);
  readonly chapters = signal<Chapter[]>([]);

  /** A picture book: its chapters are pages, with no story text or quiz. */
  readonly isPictureBook = computed(() => this.book()?.type === 'scanned');

  /** How many of this teacher's pupils have finished each chapter, by id. */
  readonly classProgress = signal<Record<number, ChapterClassProgress>>({});
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly isFormOpen = signal(false);
  readonly editingChapterId = signal<number | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly noticeMessage = signal<string | null>(null);

  chapterForm: ChapterPayload = this.emptyForm();

  ngOnInit(): void {
    this.loadChapters();
    this.bookService.get(this.bookId).subscribe({
      next: (response) => this.book.set(response.data),
      error: () => {},
    });
  }

  /** Class completion for one chapter, or null when nobody has the book. */
  progressFor(chapter: Chapter): ChapterClassProgress | null {
    const progress = this.classProgress()[chapter.id];

    return progress && progress.assigned > 0 ? progress : null;
  }

  loadChapters(): void {
    this.loading.set(true);
    this.chapterService.listForBook(this.bookId).subscribe({
      next: (response) => {
        this.chapters.set(response.data);
        this.classProgress.set(response.progress ?? {});
        this.loading.set(false);
      },
      error: (response) => {
        this.errorMessage.set(this.readError(response));
        this.loading.set(false);
      },
    });
  }

  // ============================================================
  //  Adding a chapter
  // ============================================================

  openUploadForm(): void {
    this.uploadFiles.set([]);
    this.uploadTitle = '';
    this.errorMessage.set(null);
    this.noticeMessage.set(null);
    this.isUploadOpen.set(true);
  }

  closeUploadForm(): void {
    if (!this.uploading()) {
      this.isUploadOpen.set(false);
    }
  }

  onPagesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.uploadFiles.set(input.files ? Array.from(input.files) : []);
    input.value = '';
  }

  /** Send the pages; the API reads them and builds the chapter (and quiz). */
  uploadChapter(): void {
    const files = this.uploadFiles();
    if (files.length === 0) {
      return;
    }

    this.uploading.set(true);
    this.errorMessage.set(null);

    this.chapterService.upload(this.bookId, files, this.uploadTitle.trim() || null).subscribe({
      next: (response) => {
        const chapter = response.data;
        this.uploading.set(false);
        this.isUploadOpen.set(false);
        this.noticeMessage.set(
          this.isPictureBook()
            ? `Added "${chapter.title}".`
            : `Added "${chapter.title}" with ${chapter.quiz_questions_count ?? 0} quiz questions written from its text. Check them on its Quiz page.`,
        );
        this.loadChapters();
      },
      error: (response: HttpErrorResponse) => {
        this.uploading.set(false);
        this.errorMessage.set(this.uploadError(response));
      },
    });
  }

  // ============================================================
  //  Editing
  // ============================================================

  openEditForm(chapter: Chapter): void {
    this.editingChapterId.set(chapter.id);
    this.chapterForm = {
      chapter_number: chapter.chapter_number,
      title: chapter.title,
      story_text: chapter.story_text ?? '',
      image_url: chapter.image_url ?? '',
      theme: chapter.theme ?? null,
    };
    this.errorMessage.set(null);
    this.isFormOpen.set(true);
  }

  closeForm(): void {
    this.isFormOpen.set(false);
  }

  saveChapter(): void {
    const chapterId = this.editingChapterId();
    if (!chapterId) {
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);

    // A picture book's chapter has no text of its own to send.
    const payload: ChapterPayload = this.isPictureBook()
      ? {
          chapter_number: this.chapterForm.chapter_number,
          title: this.chapterForm.title,
          image_url: this.chapterForm.image_url,
          theme: this.chapterForm.theme ?? null,
        }
      : this.chapterForm;

    this.chapterService.update(chapterId, payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.isFormOpen.set(false);
        this.loadChapters();
      },
      error: (response) => {
        this.saving.set(false);
        this.errorMessage.set(this.readError(response));
      },
    });
  }

  /** Play (or stop) the Azure TTS narration for a chapter. */
  playNarration(chapter: Chapter): void {
    // Clicking the active chapter again stops playback.
    if (this.activeNarrationId() === chapter.id) {
      this.stopNarration();
      return;
    }

    this.stopNarration();

    if (!chapter.story_text) {
      this.errorMessage.set('This chapter has no story text to narrate yet.');
      return;
    }

    this.errorMessage.set(null);
    this.activeNarrationId.set(chapter.id);
    this.narrationLoading.set(true);

    this.narrationService.getNarration(chapter.id).subscribe({
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
        return 'This chapter has no story text to narrate yet.';
      case 502:
        return 'Could not generate narration. Please check the Azure Speech credentials and region.';
      default:
        return 'Could not play narration. Please try again.';
    }
  }

  deleteChapter(chapter: Chapter): void {
    const message = this.isPictureBook()
      ? `Delete Chapter ${chapter.chapter_number}: ${chapter.title}? Its pages will be removed too.`
      : `Delete Chapter ${chapter.chapter_number}: ${chapter.title}?`;
    if (!confirm(message)) {
      return;
    }
    this.chapterService.remove(chapter.id).subscribe({
      next: () => this.loadChapters(),
      error: (response) => this.errorMessage.set(this.readError(response)),
    });
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.imageUploading.set(true);
    this.errorMessage.set(null);
    this.uploadService.uploadImage(file).subscribe({
      next: (result) => {
        this.chapterForm.image_url = result.data.url;
        this.imageUploading.set(false);
      },
      error: (response) => {
        this.imageUploading.set(false);
        this.errorMessage.set(this.readError(response));
      },
    });
  }

  private uploadError(response: HttpErrorResponse): string {
    if (response.status === 413) {
      return 'Those files are too large to upload. Try smaller photos of the pages.';
    }

    return this.readError(response);
  }

  private emptyForm(): ChapterPayload {
    return { chapter_number: 1, title: '', story_text: '', image_url: '', theme: null };
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
