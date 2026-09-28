import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, BookPage } from '../../models';
import { BookPageChapter } from '../../models/book-page/book-page.model';
import { prepareForScan } from '../upload/image-prep';

/** A book's pages, with the chapters they are grouped under. */
export interface BookPageListResponse extends ApiResponse<BookPage[]> {
  chapters: BookPageChapter[];
}

@Injectable({ providedIn: 'root' })
export class BookPageService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  listForBook(bookId: number): Observable<BookPageListResponse> {
    return this.http.get<BookPageListResponse>(`${this.base}/books/${bookId}/pages`);
  }

  /**
   * Upload one page image into a chapter (the book's last chapter when none
   * is given). The backend runs OCR to fill the text.
   */
  upload(bookId: number, image: File, chapterId?: number | null): Observable<ApiResponse<BookPage>> {
    const form = new FormData();
    form.append('image', image);
    if (chapterId) {
      form.append('chapter_id', String(chapterId));
    }
    return this.http.post<ApiResponse<BookPage>>(`${this.base}/books/${bookId}/pages`, form);
  }

  /**
   * Read a page again — from a replacement photo when one is given, otherwise
   * from the picture already stored. This is how a page the scanner got wrong
   * is fixed, rather than by typing its words in.
   */
  rescan(pageId: number, image?: File | null): Observable<ApiResponse<BookPage>> {
    return from(image ? prepareForScan(image) : Promise.resolve(null)).pipe(
      switchMap((prepared) => {
        const form = new FormData();
        if (prepared) {
          form.append('image', prepared);
        }
        return this.http.post<ApiResponse<BookPage>>(`${this.base}/pages/${pageId}/rescan`, form);
      }),
    );
  }

  updateText(pageId: number, text: string): Observable<ApiResponse<BookPage>> {
    return this.http.put<ApiResponse<BookPage>>(`${this.base}/pages/${pageId}`, { text });
  }

  remove(pageId: number): Observable<unknown> {
    return this.http.delete(`${this.base}/pages/${pageId}`);
  }
}
