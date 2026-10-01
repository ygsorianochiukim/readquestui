import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, switchMap } from 'rxjs';
import { ThemeKey } from '../../models/theme/theme.model';
import { environment } from '../../../environments/environment';
import { ApiResponse, Chapter } from '../../models';
import { prepareForScan } from '../upload/image-prep';

/** How many of a teacher's pupils have finished one chapter. */
export interface ChapterClassProgress {
  assigned: number;
  completed: number;
  percent: number;
}

export interface ChapterListResponse extends ApiResponse<Chapter[]> {
  progress: Record<number, ChapterClassProgress>;
}

/**
 * What a teacher may change on a chapter: its title and place, its picture,
 * and fixes to text the scanner misread. The text itself comes from the scan.
 */
export interface ChapterPayload {
  chapter_number: number;
  title: string;
  story_text?: string | null;
  image_url?: string | null;
  /** Null: read in the book's theme. */
  theme?: ThemeKey | null;
}

@Injectable({ providedIn: 'root' })
export class ChapterService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  listForBook(bookId: number): Observable<ChapterListResponse> {
    return this.http.get<ChapterListResponse>(`${this.base}/books/${bookId}/chapters`);
  }

  get(id: number): Observable<ApiResponse<Chapter>> {
    return this.http.get<ApiResponse<Chapter>>(`${this.base}/chapters/${id}`);
  }

  /**
   * Add a chapter by uploading its printed pages — one PDF or page photos.
   * The words are read off the pages and, for a reader, a quiz is written
   * from them. Nothing is typed.
   */
  upload(bookId: number, files: File[], title?: string | null): Observable<ApiResponse<Chapter>> {
    // Photos are shrunk first: Azure refuses anything over 4 MB, which a
    // phone photo of a page easily is. A PDF goes as it is.
    const prepared = Promise.all(
      files.map((file) => (file.type === 'application/pdf' ? Promise.resolve(file) : prepareForScan(file))),
    );

    return from(prepared).pipe(
      switchMap((ready) => {
        const form = new FormData();

        ready.forEach((file) => form.append('files[]', file, file.name));

        if (title) {
          form.append('title', title);
        }

        return this.http.post<ApiResponse<Chapter>>(`${this.base}/books/${bookId}/chapters/upload`, form);
      }),
    );
  }

  update(id: number, payload: ChapterPayload): Observable<ApiResponse<Chapter>> {
    return this.http.put<ApiResponse<Chapter>>(`${this.base}/chapters/${id}`, payload);
  }

  remove(id: number): Observable<unknown> {
    return this.http.delete(`${this.base}/chapters/${id}`);
  }
}
