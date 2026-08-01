import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, Teacher } from '../../models';
import { clearStoredSession, getRole, getToken, storeSession } from '../../core/session';

interface AuthResponse {
  data: Teacher;
  token: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  private readonly currentTeacher = signal<Teacher | null>(null);
  private readonly authToken = signal<string | null>(
    getRole() === 'teacher' ? getToken() : null,
  );

  readonly teacher = this.currentTeacher.asReadonly();
  readonly isAuthenticated = computed(() => !!this.authToken());

  get token(): string | null {
    return this.authToken();
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.base}/teacher/login`, { email, password })
      .pipe(tap((response) => this.setSession(response)));
  }

  register(payload: {
    first_name: string;
    last_name: string;
    email: string;
    phone_number?: string | null;
    password: string;
    password_confirmation: string;
  }): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.base}/teacher/register`, payload)
      .pipe(tap((response) => this.setSession(response)));
  }

  /** Load the current teacher from the API (used to restore a session on refresh). */
  loadMe(): Observable<ApiResponse<Teacher>> {
    return this.http
      .get<ApiResponse<Teacher>>(`${this.base}/teacher/me`)
      .pipe(tap((response) => this.currentTeacher.set(response.data)));
  }

  /** Update the signed-in teacher's own profile. */
  updateProfile(payload: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone_number?: string | null;
    password?: string | null;
  }): Observable<ApiResponse<Teacher>> {
    return this.http
      .put<ApiResponse<Teacher>>(`${this.base}/teacher/me`, payload)
      .pipe(tap((response) => this.currentTeacher.set(response.data)));
  }

  logout(): Observable<unknown> {
    return this.http.post(`${this.base}/teacher/logout`, {}).pipe(
      tap({
        next: () => this.clearSession(),
        error: () => this.clearSession(),
      }),
    );
  }

  private setSession(response: AuthResponse): void {
    this.authToken.set(response.token);
    this.currentTeacher.set(response.data);
    storeSession(response.token, 'teacher');
  }

  clearSession(): void {
    this.authToken.set(null);
    this.currentTeacher.set(null);
    clearStoredSession();
  }
}
