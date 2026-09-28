import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ApiResponse,
  Book,
  BookPage,
  IngestBatch,
  IngestPreview,
  SuggestedChapter,
} from '../../models';
import { SuggestedPart } from '../../models/ingest/ingest.model';
import { prepareForScan } from '../upload/image-prep';

export interface IngestListResponse {
  data: IngestBatch[];
  meta: {
    /** False when the server cannot turn PDF pages into images. */
    can_render_pdf_pages: boolean;
  };
}

export interface CommitOptions {
  title?: string | null;
  readingLevel?: string | null;
  /**
   * Either way the book comes out as Book → Chapters → Content. True builds a
   * chapter reader (story text, games, quizzes); false keeps the page images
   * as the content, grouped into chapters (a picture book).
   */
  asChapters: boolean;
  chapters?: SuggestedChapter[] | null;
  /** The picture-book grouping, with any titles the teacher changed. */
  parts?: SuggestedPart[] | null;
}

/**
 * Uploading reading material.
 *
 * Nothing here creates a book first — the book is what comes out of the
 * upload, and the teacher only ever sees it once there is something to look at.
 */
@Injectable({ providedIn: 'root' })
export class IngestService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  /** Recent uploads, so an interrupted one can be picked back up. */
  list(): Observable<IngestListResponse> {
    return this.http.get<IngestListResponse>(`${this.base}/ingest`);
  }

  /** Send a PDF, or a set of page photos. */
  start(files: File[], title?: string | null, bookId?: number): Observable<ApiResponse<IngestBatch>> {
    const form = new FormData();

    files.forEach((file) => form.append('files[]', file, file.name));

    if (title) {
      form.append('title', title);
    }
    if (bookId) {
      form.append('book_id', String(bookId));
    }

    return this.http.post<ApiResponse<IngestBatch>>(`${this.base}/ingest`, form);
  }

  /** Poll while it is being read; the same call is the preview once it is done. */
  show(batchId: number): Observable<ApiResponse<IngestPreview>> {
    return this.http.get<ApiResponse<IngestPreview>>(`${this.base}/ingest/${batchId}`);
  }

  /** Correct what the scanner misread, before anything is published. */
  updatePage(batchId: number, pageId: number, text: string | null): Observable<ApiResponse<BookPage>> {
    return this.http.patch<ApiResponse<BookPage>>(
      `${this.base}/ingest/${batchId}/pages/${pageId}`,
      { text },
    );
  }

  /**
   * Read one page again — from a replacement photo when one is given (a
   * blurry or cropped shot), otherwise from the picture already uploaded.
   */
  rescanPage(batchId: number, pageId: number, image?: File | null): Observable<ApiResponse<BookPage>> {
    return from(image ? prepareForScan(image) : Promise.resolve(null)).pipe(
      switchMap((prepared) => {
        const form = new FormData();
        if (prepared) {
          form.append('image', prepared);
        }
        return this.http.post<ApiResponse<BookPage>>(
          `${this.base}/ingest/${batchId}/pages/${pageId}/rescan`,
          form,
        );
      }),
    );
  }

  /** Publish the book. */
  commit(batchId: number, options: CommitOptions): Observable<ApiResponse<Book>> {
    return this.http.post<ApiResponse<Book>>(`${this.base}/ingest/${batchId}/commit`, {
      title: options.title ?? null,
      reading_level: options.readingLevel ?? null,
      as_chapters: options.asChapters,
      chapters: options.chapters ?? null,
      parts: options.parts ?? null,
    });
  }

  /** Throw the draft away. */
  discard(batchId: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/ingest/${batchId}`);
  }
}
