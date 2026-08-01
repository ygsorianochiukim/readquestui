import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, Book } from '../../models';

@Injectable({ providedIn: 'root' })
export class ReaderService {
  private http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/reader`;

  /** Books available to read (any authenticated user). */
  books(): Observable<ApiResponse<Book[]>> {
    return this.http.get<ApiResponse<Book[]>>(`${this.base}/books`);
  }

  /** A single book with its pages and chapters. */
  book(id: number): Observable<ApiResponse<Book>> {
    return this.http.get<ApiResponse<Book>>(`${this.base}/books/${id}`);
  }
}
