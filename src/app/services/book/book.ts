import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, Book } from '../../models';

export interface BookPayload {
  title: string;
  type?: string;
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

  list(): Observable<ApiResponse<Book[]>> {
    return this.http.get<ApiResponse<Book[]>>(this.base);
  }

  get(id: number): Observable<ApiResponse<Book>> {
    return this.http.get<ApiResponse<Book>>(`${this.base}/${id}`);
  }

  create(payload: BookPayload): Observable<ApiResponse<Book>> {
    return this.http.post<ApiResponse<Book>>(this.base, payload);
  }

  update(id: number, payload: BookPayload): Observable<ApiResponse<Book>> {
    return this.http.put<ApiResponse<Book>>(`${this.base}/${id}`, payload);
  }

  remove(id: number): Observable<unknown> {
    return this.http.delete(`${this.base}/${id}`);
  }
}
