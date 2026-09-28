import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ApiResponse,
  AssessmentResponse,
  PronunciationAttempt,
  PronunciationWord,
  ReadingReport,
} from '../../models';

export interface PronunciationTarget {
  bookPageId?: number;
  chapterId?: number;
  /** With a chapter and one of its pages: the paragraph of that page being read. */
  paragraphIndex?: number;
}

export interface ReviewQueueFilters {
  studentId?: number;
  status?: 'pending' | 'reviewed';
  onlyFailed?: boolean;
  from?: string;
  to?: string;
  page?: number;
}

export interface ReviewQueue {
  data: PronunciationAttempt[];
  meta: {
    current_page: number;
    last_page: number;
    total: number;
    pending: number;
  };
}

@Injectable({ providedIn: 'root' })
export class PronunciationService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  /**
   * Student: submit a recording to be scored against the page/chapter text.
   *
   * This stays the authority on the score even when the live reader has
   * already coloured the page: only the server checks what was said against
   * what the page says, so only the server can catch a child reading something
   * else entirely.
   */
  assess(audio: Blob, target: PronunciationTarget): Observable<AssessmentResponse> {
    const form = new FormData();
    form.append('audio', audio, 'reading.wav');
    if (target.bookPageId) {
      form.append('book_page_id', String(target.bookPageId));
    }
    if (target.chapterId) {
      form.append('chapter_id', String(target.chapterId));
    }
    if (target.paragraphIndex != null) {
      form.append('paragraph_index', String(target.paragraphIndex));
    }
    return this.http.post<AssessmentResponse>(`${this.base}/pronunciation`, form);
  }

  /** Student: re-open one of their own readings, words included. */
  attempt(attemptId: number): Observable<ApiResponse<PronunciationAttempt>> {
    return this.http.get<ApiResponse<PronunciationAttempt>>(
      `${this.base}/student/pronunciation/${attemptId}`,
    );
  }

  /**
   * Student: keep the result of a second go at one word of a stored reading,
   * so the teacher can see it was put right. The reading's score is untouched.
   */
  retryWord(
    attemptId: number,
    wordId: number,
    accuracy: number,
  ): Observable<ApiResponse<PronunciationWord>> {
    return this.http.post<ApiResponse<PronunciationWord>>(
      `${this.base}/student/pronunciation/${attemptId}/words/${wordId}/retry`,
      { accuracy },
    );
  }

  /** Teacher: list a student's attempts. */
  forStudent(studentId: number): Observable<ApiResponse<PronunciationAttempt[]>> {
    return this.http.get<ApiResponse<PronunciationAttempt[]>>(
      `${this.base}/students/${studentId}/pronunciation`,
    );
  }

  /** Teacher: the whole class's readings waiting to be checked. */
  queue(filters: ReviewQueueFilters = {}): Observable<ReviewQueue> {
    let params = new HttpParams();

    if (filters.studentId) {
      params = params.set('student_id', filters.studentId);
    }
    if (filters.status) {
      params = params.set('status', filters.status);
    }
    if (filters.onlyFailed) {
      params = params.set('only_failed', '1');
    }
    if (filters.from) {
      params = params.set('from', filters.from);
    }
    if (filters.to) {
      params = params.set('to', filters.to);
    }
    if (filters.page) {
      params = params.set('page', filters.page);
    }

    return this.http.get<ReviewQueue>(`${this.base}/pronunciation/queue`, { params });
  }

  /** Teacher: one attempt in full, word by word. */
  review(attemptId: number): Observable<ApiResponse<PronunciationAttempt>> {
    return this.http.get<ApiResponse<PronunciationAttempt>>(
      `${this.base}/pronunciation/${attemptId}`,
    );
  }

  /** Teacher: the individual reading report for a student. */
  report(studentId: number): Observable<ApiResponse<ReadingReport>> {
    return this.http.get<ApiResponse<ReadingReport>>(
      `${this.base}/students/${studentId}/reading-report`,
    );
  }

  /** Teacher: confirm the automatic score is right. */
  validate(attemptId: number): Observable<ApiResponse<PronunciationAttempt>> {
    return this.http.post<ApiResponse<PronunciationAttempt>>(
      `${this.base}/pronunciation/${attemptId}/validate`,
      {},
    );
  }

  /**
   * Teacher: replace the automatic score with their own.
   * Pass null to withdraw an override and let the machine's score stand again.
   */
  override(
    attemptId: number,
    teacherScore: number | null,
    teacherNote?: string | null,
  ): Observable<ApiResponse<PronunciationAttempt>> {
    return this.http.post<ApiResponse<PronunciationAttempt>>(
      `${this.base}/pronunciation/${attemptId}/score`,
      { teacher_score: teacherScore, teacher_note: teacherNote ?? null },
    );
  }
}
