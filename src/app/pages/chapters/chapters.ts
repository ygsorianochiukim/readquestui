import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ChapterPayload, ChapterService } from '../../services/chapter/chapter';
import { BookService } from '../../services/book/book';
import { NarrationService } from '../../services/narration/narration';
import { UploadService } from '../../services/upload/upload';
import { Chapter } from '../../models';
import {
  Alert,
  Button,
  EmptyState,
  FormField,
  Modal,
  Spinner,
  Icon,
} from '../../shared/components';

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
    Spinner,
    Icon
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

  // ---- Scanning a printed page into the story text (Azure Vision OCR) ----
  readonly scanning = signal(false);
  readonly scanMessage = signal<string | null>(null);

  // ---- Narration (Azure TTS) playback ----
  readonly activeNarrationId = signal<number | null>(null);
  readonly narrationLoading = signal(false);
  private audio: HTMLAudioElement | null = null;

  readonly bookId = Number(this.route.snapshot.paramMap.get('bookId'));
  readonly bookTitle = signal<string>('');
  readonly chapters = signal<Chapter[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly isFormOpen = signal(false);
  readonly editingChapterId = signal<number | null>(null);
  readonly errorMessage = signal<string | null>(null);

  chapterForm: ChapterPayload = this.emptyForm();

  ngOnInit(): void {
    this.loadChapters();
    this.bookService.get(this.bookId).subscribe({
      next: (response) => this.bookTitle.set(response.data.title),
      error: () => {},
    });
  }

  loadChapters(): void {
    this.loading.set(true);
    this.chapterService.listForBook(this.bookId).subscribe({
      next: (response) => {
        this.chapters.set(response.data);
        this.loading.set(false);
      },
      error: (response) => {
        this.errorMessage.set(this.readError(response));
        this.loading.set(false);
      },
    });
  }

  openCreateForm(): void {
    this.editingChapterId.set(null);
    const nextNumber = (this.chapters().at(-1)?.chapter_number ?? 0) + 1;
    this.chapterForm = { ...this.emptyForm(), chapter_number: nextNumber };
    this.errorMessage.set(null);
    this.isFormOpen.set(true);
  }

  openEditForm(chapter: Chapter): void {
    this.editingChapterId.set(chapter.id);
    this.chapterForm = {
      chapter_number: chapter.chapter_number,
      title: chapter.title,
      story_text: chapter.story_text ?? '',
      image_url: chapter.image_url ?? '',
      audio_url: chapter.audio_url ?? '',
    };
    this.errorMessage.set(null);
    this.isFormOpen.set(true);
  }

  closeForm(): void {
    this.isFormOpen.set(false);
  }

  saveChapter(): void {
    this.saving.set(true);
    this.errorMessage.set(null);

    const chapterId = this.editingChapterId();
    const request = chapterId
      ? this.chapterService.update(chapterId, this.chapterForm)
      : this.chapterService.create(this.bookId, this.chapterForm);

    request.subscribe({
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
    const confirmed = confirm(`Delete Chapter ${chapter.chapter_number}: ${chapter.title}?`);
    if (!confirmed) {
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

  /**
   * Scan a photo of the printed page and append what it reads to the story
   * text. Appending (rather than replacing) lets a teacher scan a chapter that
   * runs across several printed pages, one after another.
   */
  onScanSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    this.scanning.set(true);
    this.scanMessage.set(null);
    this.errorMessage.set(null);

    this.uploadService.scanText(file).subscribe({
      next: (result) => {
        const scanned = result.data.text.trim();
        this.scanning.set(false);

        if (!scanned) {
          this.scanMessage.set('No text found on that image. Try a clearer photo.');
          return;
        }

        const existing = (this.chapterForm.story_text ?? '').trim();
        this.chapterForm.story_text = existing ? `${existing}\n\n${scanned}` : scanned;
        this.scanMessage.set(
          `Added ${result.data.lines} line${result.data.lines === 1 ? '' : 's'} — please check the text and fix anything the scan got wrong.`,
        );
      },
      error: (response: HttpErrorResponse) => {
        this.scanning.set(false);
        this.errorMessage.set(this.scanError(response));
      },
    });
  }

  private scanError(response: HttpErrorResponse): string {
    // 502 and 503 already carry a specific, actionable message from the API.
    if (response.status === 502 || response.status === 503) {
      return response.error?.message ?? 'Could not read that image. Please try again.';
    }

    if (response.status === 413) {
      return 'That image is too large to upload. Try a smaller photo of the page.';
    }

    return this.readError(response);
  }

  private emptyForm(): ChapterPayload {
    return { chapter_number: 1, title: '', story_text: '', image_url: '', audio_url: '' };
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
