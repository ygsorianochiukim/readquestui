import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { BookPayload, BookService } from '../../services/book/book';
import { UploadService } from '../../services/upload/upload';
import { Book } from '../../models';
import {
  Alert,
  Button,
  EmptyState,
  FormField,
  Modal,
  Spinner,
} from '../../shared/components';

@Component({
  selector: 'app-books',
  imports: [
    FormsModule,
    RouterLink,
    Alert,
    Button,
    EmptyState,
    FormField,
    Modal,
    Spinner,
  ],
  templateUrl: './books.html',
  styleUrl: './books.scss',
})
export class Books implements OnInit {
  private bookService = inject(BookService);
  private uploadService = inject(UploadService);

  readonly coverUploading = signal(false);

  readonly books = signal<Book[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly isFormOpen = signal(false);
  readonly editingBookId = signal<number | null>(null);
  readonly errorMessage = signal<string | null>(null);

  bookForm: BookPayload = this.emptyForm();

  ngOnInit(): void {
    this.loadBooks();
  }

  loadBooks(): void {
    this.loading.set(true);
    this.bookService.list().subscribe({
      next: (response) => {
        this.books.set(response.data);
        this.loading.set(false);
      },
      error: (response) => {
        this.errorMessage.set(this.readError(response));
        this.loading.set(false);
      },
    });
  }

  openCreateForm(): void {
    this.editingBookId.set(null);
    this.bookForm = this.emptyForm();
    this.errorMessage.set(null);
    this.isFormOpen.set(true);
  }

  openEditForm(book: Book): void {
    this.editingBookId.set(book.id);
    this.bookForm = {
      title: book.title,
      type: book.type,
      description: book.description ?? '',
      cover_image_url: book.cover_image_url ?? '',
      reading_level: book.reading_level ?? '',
      sequence: book.sequence,
      status: book.status,
    };
    this.errorMessage.set(null);
    this.isFormOpen.set(true);
  }

  closeForm(): void {
    this.isFormOpen.set(false);
  }

  onCoverSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.coverUploading.set(true);
    this.errorMessage.set(null);
    this.uploadService.uploadImage(file).subscribe({
      next: (result) => {
        this.bookForm.cover_image_url = result.data.url;
        this.coverUploading.set(false);
      },
      error: (response) => {
        this.coverUploading.set(false);
        this.errorMessage.set(this.readError(response));
      },
    });
  }

  saveBook(): void {
    this.saving.set(true);
    this.errorMessage.set(null);

    const bookId = this.editingBookId();
    const request = bookId
      ? this.bookService.update(bookId, this.bookForm)
      : this.bookService.create(this.bookForm);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.isFormOpen.set(false);
        this.loadBooks();
      },
      error: (response) => {
        this.saving.set(false);
        this.errorMessage.set(this.readError(response));
      },
    });
  }

  deleteBook(book: Book): void {
    const confirmed = confirm(`Delete "${book.title}"? Its chapters and quizzes will be removed too.`);
    if (!confirmed) {
      return;
    }
    this.bookService.remove(book.id).subscribe({
      next: () => this.loadBooks(),
      error: (response) => this.errorMessage.set(this.readError(response)),
    });
  }

  private emptyForm(): BookPayload {
    return {
      title: '',
      type: 'standard',
      description: '',
      cover_image_url: '',
      reading_level: '',
      sequence: 1,
      status: 'active',
    };
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
