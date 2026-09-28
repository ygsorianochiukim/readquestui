import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, Book } from '../../models';

/** How far a teacher's own class has got through one book. */
export interface ClassProgress {
  assigned: number;
  completed: number;
  percent: number;
}

/** The book list, with class progress keyed by book id. */
export interface BookListResponse extends ApiResponse<Book[]> {
  progress: Record<number, ClassProgress>;
}

/**
 * The details a teacher may change on a book. There is no payload for making
 * one: books are created by uploading their material (see IngestService).
 */
export interface BookPayload {
  title: string;
  description?: string | null;
  cover_image_url?: string | null;
  reading_level?: string | null;
  sequence?: number;
  status?: string;
}

@Injectable({ providedIn: 'root' })
export class BookService {
  private http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/books`;

  list(): Observable<BookListResponse> {
    return this.http.get<BookListResponse>(this.base);
  }

  get(id: number): Observable<ApiResponse<Book>> {
    return this.http.get<ApiResponse<Book>>(`${this.base}/${id}`);
  }

  update(id: number, payload: BookPayload): Observable<ApiResponse<Book>> {
    return this.http.put<ApiResponse<Book>>(`${this.base}/${id}`, payload);
  }

  remove(id: number): Observable<unknown> {
    return this.http.delete(`${this.base}/${id}`);
  }
}
