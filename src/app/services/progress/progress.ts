import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ApiResponse,
  BookOverview,
  BookPageProgress,
  BookProgress,
  Celebrations,
  ChapterProgress,
  QuizResult,
  ReadAloudSummary,
  StudentQuizQuestion,
} from '../../models';
import {
  GameType,
  GameWin,
  GameWinRecord,
  QuizAnswerCheck,
} from '../../models/progress/progress.model';

/**
 * Anything a child can finish can also earn them something, so these endpoints
 * report it alongside the progress they return. Optional, because a response
 * from an older API simply has nothing to celebrate.
 */
export interface Rewarded<T> extends ApiResponse<T> {
  celebrations?: Celebrations;
}

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

  /** Which pages of a chapter the pupil has read aloud so far, and how well. */
  readAloud(chapterId: number): Observable<ApiResponse<ReadAloudSummary>> {
    return this.http.get<ApiResponse<ReadAloudSummary>>(
      `${this.base}/student/chapters/${chapterId}/read-aloud`,
    );
  }

  /** Quiz questions for a chapter (no answers included). */
  quiz(chapterId: number): Observable<ApiResponse<StudentQuizQuestion[]>> {
    return this.http.get<ApiResponse<StudentQuizQuestion[]>>(
      `${this.base}/student/chapters/${chapterId}/quiz`,
    );
  }

  /** Submit quiz answers (question id => chosen answer); graded server-side. */
  submitQuiz(chapterId: number, answers: Record<number, string>): Observable<Rewarded<QuizResult>> {
    return this.http.post<Rewarded<QuizResult>>(
      `${this.base}/student/chapters/${chapterId}/quiz`,
      { answers },
    );
  }

  /**
   * Check one answer the moment it is picked. Only this question's answer
   * comes back, and nothing is recorded — the submission above is graded.
   */
  checkQuizAnswer(
    chapterId: number,
    questionId: number,
    answer: string,
  ): Observable<ApiResponse<QuizAnswerCheck>> {
    return this.http.post<ApiResponse<QuizAnswerCheck>>(
      `${this.base}/student/chapters/${chapterId}/quiz/check`,
      { question_id: questionId, answer },
    );
  }

  markStoryRead(chapterId: number): Observable<ApiResponse<ChapterProgress>> {
    return this.http.post<ApiResponse<ChapterProgress>>(
      `${this.base}/student/chapters/${chapterId}/story-read`,
      {},
    );
  }

  /** Page-by-page progress for a scanned book. */
  bookPages(bookId: number): Observable<ApiResponse<BookPageProgress>> {
    return this.http.get<ApiResponse<BookPageProgress>>(
      `${this.base}/student/books/${bookId}/pages`,
    );
  }

  /** Mark a scanned page as read; returns the book's refreshed page progress. */
  markPageRead(pageId: number): Observable<Rewarded<BookPageProgress>> {
    return this.http.post<Rewarded<BookPageProgress>>(
      `${this.base}/student/pages/${pageId}/read`,
      {},
    );
  }

  /**
   * A mini-game was won. Any one game completes the chapter's game step; each
   * game type pays points on its first win only, reported under `game`.
   */
  completeGame(
    chapterId: number,
    gameType: GameType,
    mistakes: number,
  ): Observable<Rewarded<ChapterProgress> & { game?: GameWin }> {
    return this.http.post<Rewarded<ChapterProgress> & { game?: GameWin }>(
      `${this.base}/student/chapters/${chapterId}/game`,
      { game_type: gameType, mistakes },
    );
  }

  /** The mini-games already won on a chapter, for the per-game stars. */
  chapterGames(chapterId: number): Observable<ApiResponse<GameWinRecord[]>> {
    return this.http.get<ApiResponse<GameWinRecord[]>>(
      `${this.base}/student/chapters/${chapterId}/games`,
    );
  }
}
