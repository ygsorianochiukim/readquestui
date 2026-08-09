import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { BookPageService } from '../../services/book-page/book-page';
import { NarrationService } from '../../services/narration/narration';
import { BookPage } from '../../models';
import { Alert, Button, EmptyState, Spinner, Icon } from '../../shared/components';

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

  readonly bookId = Number(this.route.snapshot.paramMap.get('bookId'));
  readonly pages = signal<BookPage[]>([]);
  readonly loading = signal(true);
  readonly uploading = signal(false);
  readonly uploadProgress = signal('');
  readonly savingPageId = signal<number | null>(null);
  readonly errorMessage = signal<string | null>(null);

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
        this.loading.set(false);
      },
      error: (response) => {
        this.errorMessage.set(this.readError(response));
        this.loading.set(false);
      },
    });
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
    this.pageService.upload(this.bookId, files[index]).subscribe({
      next: () => this.uploadNext(files, index + 1),
      error: (response) => {
        this.uploading.set(false);
        this.uploadProgress.set('');
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
