import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, Student } from '../../models';
import { clearStoredSession, getRole, getToken, storeSession } from '../../core/session';

interface StudentAuthResponse {
  data: Student;
  token: string;
}

@Injectable({ providedIn: 'root' })
export class StudentAuthService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  private readonly currentStudent = signal<Student | null>(null);
  private readonly authToken = signal<string | null>(
    getRole() === 'student' ? getToken() : null,
  );

  readonly student = this.currentStudent.asReadonly();
  readonly isAuthenticated = computed(() => !!this.authToken());

  login(username: string, password: string): Observable<StudentAuthResponse> {
    return this.http
      .post<StudentAuthResponse>(`${this.base}/student/login`, { username, password })
      .pipe(tap((response) => this.setSession(response)));
  }

  /** Load the current student from the API (used to restore a session on refresh). */
  loadMe(): Observable<ApiResponse<Student>> {
    return this.http
      .get<ApiResponse<Student>>(`${this.base}/student/me`)
      .pipe(tap((response) => this.currentStudent.set(response.data)));
  }

  logout(): Observable<unknown> {
    return this.http.post(`${this.base}/student/logout`, {}).pipe(
      tap({
        next: () => this.clearSession(),
        error: () => this.clearSession(),
      }),
    );
  }

  private setSession(response: StudentAuthResponse): void {
    this.authToken.set(response.token);
    this.currentStudent.set(response.data);
    storeSession(response.token, 'student');
  }

  clearSession(): void {
    this.authToken.set(null);
    this.currentStudent.set(null);
    clearStoredSession();
  }
}
