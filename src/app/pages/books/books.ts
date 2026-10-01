import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { BookPayload, BookService, ClassProgress } from '../../services/book/book';
import { UploadService } from '../../services/upload/upload';
import { Book } from '../../models';
import { themeFor } from '../../models/theme/theme.model';
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
    ProgressBar,
    Spinner,
    Icon,
    ThemePicker,
  ],
  templateUrl: './books.html',
  styleUrl: './books.scss',
})
export class Books implements OnInit {
  private bookService = inject(BookService);
  private uploadService = inject(UploadService);
  private router = inject(Router);

  readonly coverUploading = signal(false);

  readonly books = signal<Book[]>([]);

  /** How far this teacher's class has got through each book, keyed by book id. */
  readonly classProgress = signal<Record<number, ClassProgress>>({});
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly isFormOpen = signal(false);
  readonly editingBookId = signal<number | null>(null);
  readonly errorMessage = signal<string | null>(null);

  bookForm: BookPayload = this.emptyForm();

  // ---- Reading order ----
  /** Arranging the shelf: the books in the order pupils will meet them. */
  readonly ordering = signal(false);
  readonly orderDraft = signal<Book[]>([]);
  readonly savingOrder = signal(false);
  /** The book being dragged, by its place in the list. */
  readonly dragIndex = signal<number | null>(null);

  ngOnInit(): void {
    this.loadBooks();
  }

  loadBooks(): void {
    this.loading.set(true);
    this.bookService.list().subscribe({
      next: (response) => {
        this.books.set(response.data);
        this.classProgress.set(response.progress ?? {});
        this.loading.set(false);
      },
      error: (response) => {
        this.errorMessage.set(this.readError(response));
        this.loading.set(false);
      },
    });
  }

  /** The only way to make a book: upload it and let the pages be read. */
  goToUpload(): void {
    this.router.navigate(['/dashboard/upload']);
  }

  /** The theme's name for a book card, or null for the classic look. */
  themeName(book: Book): string | null {
    return themeFor(book.theme)?.name ?? null;
  }

  /** The first scenery picture of a book's theme, for its card. */
  themeEmoji(book: Book): string | null {
    return themeFor(book.theme)?.scenery[0] ?? null;
  }

  startOrdering(): void {
    this.orderDraft.set([...this.books()].sort((a, b) => a.sequence - b.sequence));
    this.errorMessage.set(null);
    this.ordering.set(true);
  }

  cancelOrdering(): void {
    this.ordering.set(false);
    this.dragIndex.set(null);
  }

  /** Move a book up (-1) or down (+1) the reading order. */
  moveBook(index: number, delta: number): void {
    this.placeBook(index, index + delta);
  }

  onDragStart(index: number, event: DragEvent): void {
    this.dragIndex.set(index);
    // Firefox will not start a drag without some data.
    event.dataTransfer?.setData('text/plain', String(index));
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  /** Dragging over another book moves the dragged one into its place. */
  onDragOver(index: number, event: DragEvent): void {
    const from = this.dragIndex();
    if (from === null) {
      return;
    }

    event.preventDefault();
    if (from !== index) {
      this.placeBook(from, index);
      this.dragIndex.set(index);
    }
  }

  onDragEnd(): void {
    this.dragIndex.set(null);
  }

  saveOrder(): void {
    this.savingOrder.set(true);
    this.errorMessage.set(null);

    this.bookService.reorder(this.orderDraft().map((book) => book.id)).subscribe({
      next: (response) => {
        this.books.set(response.data);
        this.savingOrder.set(false);
        this.ordering.set(false);
      },
      error: (response) => {
        this.savingOrder.set(false);
        this.errorMessage.set(this.readError(response));
      },
    });
  }

  private placeBook(from: number, to: number): void {
    const books = [...this.orderDraft()];
    if (to < 0 || to >= books.length || from === to) {
      return;
    }

    const [book] = books.splice(from, 1);
    books.splice(to, 0, book);
    this.orderDraft.set(books);
  }

  /** Class progress for one book, or nulls when nobody has it assigned. */
  progressFor(book: Book): ClassProgress | null {
    return this.classProgress()[book.id] ?? null;
  }

  openEditForm(book: Book): void {
    this.editingBookId.set(book.id);
    this.bookForm = {
      title: book.title,
      description: book.description ?? '',
      cover_image_url: book.cover_image_url ?? '',
      reading_level: book.reading_level ?? '',
      status: book.status,
      theme: book.theme ?? null,
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
    // Only an existing book is ever saved here; new ones come from uploads.
    const bookId = this.editingBookId();
    if (!bookId) {
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);

    this.bookService.update(bookId, this.bookForm).subscribe({
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
      description: '',
      cover_image_url: '',
      reading_level: '',
      status: 'active',
      theme: null,
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
