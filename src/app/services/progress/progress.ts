import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ApiResponse,
  BookOverview,
  BookProgress,
  ChapterProgress,
  QuizResult,
  StudentQuizQuestion,
} from '../../models';

/** Student-facing learning loop: progress, activities and quizzes. */
@Injectable({ providedIn: 'root' })
export class ProgressService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  /** All assigned books with completion + lock state (plus the student's points). */
  overview(): Observable<{ data: BookOverview[]; points: number }> {
    return this.http.get<{ data: BookOverview[]; points: number }>(`${this.base}/student/progress`);
  }

  /** One assigned book with its chapters + per-chapter progress/lock. */
  book(bookId: number): Observable<ApiResponse<BookProgress>> {
    return this.http.get<ApiResponse<BookProgress>>(`${this.base}/student/books/${bookId}/progress`);
  }

  /** Quiz questions for a chapter (no answers included). */
  quiz(chapterId: number): Observable<ApiResponse<StudentQuizQuestion[]>> {
    return this.http.get<ApiResponse<StudentQuizQuestion[]>>(
      `${this.base}/student/chapters/${chapterId}/quiz`,
    );
  }

  /** Submit quiz answers (question id => chosen answer); graded server-side. */
  submitQuiz(chapterId: number, answers: Record<number, string>): Observable<ApiResponse<QuizResult>> {
    return this.http.post<ApiResponse<QuizResult>>(
      `${this.base}/student/chapters/${chapterId}/quiz`,
      { answers },
    );
  }

  markStoryRead(chapterId: number): Observable<ApiResponse<ChapterProgress>> {
    return this.http.post<ApiResponse<ChapterProgress>>(
      `${this.base}/student/chapters/${chapterId}/story-read`,
      {},
    );
  }

  completeGame(chapterId: number): Observable<ApiResponse<ChapterProgress>> {
    return this.http.post<ApiResponse<ChapterProgress>>(
      `${this.base}/student/chapters/${chapterId}/game`,
      {},
    );
  }
}
