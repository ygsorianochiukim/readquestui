import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, Book } from '../../models';

/** Teacher: manage which books are assigned to a student. */
@Injectable({ providedIn: 'root' })
export class AssignmentService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  forStudent(studentId: number): Observable<ApiResponse<Book[]>> {
    return this.http.get<ApiResponse<Book[]>>(`${this.base}/students/${studentId}/books`);
  }

  sync(studentId: number, bookIds: number[]): Observable<ApiResponse<Book[]>> {
    return this.http.put<ApiResponse<Book[]>>(`${this.base}/students/${studentId}/books`, {
      book_ids: bookIds,
    });
  }
}
