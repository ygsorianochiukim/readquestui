import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, Chapter } from '../../models';

export interface ChapterPayload {
  chapter_number: number;
  title: string;
  story_text?: string | null;
  image_url?: string | null;
  audio_url?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ChapterService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  listForBook(bookId: number): Observable<ApiResponse<Chapter[]>> {
    return this.http.get<ApiResponse<Chapter[]>>(`${this.base}/books/${bookId}/chapters`);
  }

  get(id: number): Observable<ApiResponse<Chapter>> {
    return this.http.get<ApiResponse<Chapter>>(`${this.base}/chapters/${id}`);
  }

  create(bookId: number, payload: ChapterPayload): Observable<ApiResponse<Chapter>> {
    return this.http.post<ApiResponse<Chapter>>(`${this.base}/books/${bookId}/chapters`, payload);
  }

  update(id: number, payload: ChapterPayload): Observable<ApiResponse<Chapter>> {
    return this.http.put<ApiResponse<Chapter>>(`${this.base}/chapters/${id}`, payload);
  }

  remove(id: number): Observable<unknown> {
    return this.http.delete(`${this.base}/chapters/${id}`);
  }
}
