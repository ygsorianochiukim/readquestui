import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, PronunciationAttempt } from '../../models';

export interface PronunciationTarget {
  bookPageId?: number;
  chapterId?: number;
}

@Injectable({ providedIn: 'root' })
export class PronunciationService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  /** Student: submit a recording to be scored against the page/chapter text. */
  assess(audio: Blob, target: PronunciationTarget): Observable<ApiResponse<PronunciationAttempt>> {
    const form = new FormData();
    form.append('audio', audio, 'reading.wav');
    if (target.bookPageId) {
      form.append('book_page_id', String(target.bookPageId));
    }
    if (target.chapterId) {
      form.append('chapter_id', String(target.chapterId));
    }
    return this.http.post<ApiResponse<PronunciationAttempt>>(`${this.base}/pronunciation`, form);
  }

  /** Teacher: list a student's attempts. */
  forStudent(studentId: number): Observable<ApiResponse<PronunciationAttempt[]>> {
    return this.http.get<ApiResponse<PronunciationAttempt[]>>(
      `${this.base}/students/${studentId}/pronunciation`,
    );
  }

  /** Teacher: validate an attempt. */
  validate(attemptId: number): Observable<ApiResponse<PronunciationAttempt>> {
    return this.http.post<ApiResponse<PronunciationAttempt>>(
      `${this.base}/pronunciation/${attemptId}/validate`,
      {},
    );
  }
}
