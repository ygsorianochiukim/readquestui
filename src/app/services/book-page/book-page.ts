import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, BookPage } from '../../models';

@Injectable({ providedIn: 'root' })
export class BookPageService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  listForBook(bookId: number): Observable<ApiResponse<BookPage[]>> {
    return this.http.get<ApiResponse<BookPage[]>>(`${this.base}/books/${bookId}/pages`);
  }

  /** Upload one page image (the backend runs OCR to fill the text). */
  upload(bookId: number, image: File): Observable<ApiResponse<BookPage>> {
    const form = new FormData();
    form.append('image', image);
    return this.http.post<ApiResponse<BookPage>>(`${this.base}/books/${bookId}/pages`, form);
  }

  updateText(pageId: number, text: string): Observable<ApiResponse<BookPage>> {
    return this.http.put<ApiResponse<BookPage>>(`${this.base}/pages/${pageId}`, { text });
  }

  remove(pageId: number): Observable<unknown> {
    return this.http.delete(`${this.base}/pages/${pageId}`);
  }
}
