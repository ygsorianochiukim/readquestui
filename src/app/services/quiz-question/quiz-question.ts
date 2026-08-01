import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, QuizQuestion } from '../../models';

export interface QuizQuestionPayload {
  question_text: string;
  choices: string[];
  correct_answer: string;
}

@Injectable({ providedIn: 'root' })
export class QuizQuestionService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  listForChapter(chapterId: number): Observable<ApiResponse<QuizQuestion[]>> {
    return this.http.get<ApiResponse<QuizQuestion[]>>(
      `${this.base}/chapters/${chapterId}/quiz-questions`,
    );
  }

  create(chapterId: number, payload: QuizQuestionPayload): Observable<ApiResponse<QuizQuestion>> {
    return this.http.post<ApiResponse<QuizQuestion>>(
      `${this.base}/chapters/${chapterId}/quiz-questions`,
      payload,
    );
  }

  update(id: number, payload: QuizQuestionPayload): Observable<ApiResponse<QuizQuestion>> {
    return this.http.put<ApiResponse<QuizQuestion>>(`${this.base}/quiz-questions/${id}`, payload);
  }

  remove(id: number): Observable<unknown> {
    return this.http.delete(`${this.base}/quiz-questions/${id}`);
  }
}
