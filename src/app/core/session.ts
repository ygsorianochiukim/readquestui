// =============================================================
//  Session storage helpers
//  A single place that knows how the auth token and the user's
//  role are kept in the browser. Both the teacher and student
//  auth services, the HTTP interceptor and the route guards use
//  these helpers so there is one source of truth.
// =============================================================

export type UserRole = 'teacher' | 'student';

const TOKEN_KEY = 'readquest_token';
const ROLE_KEY = 'readquest_role';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRole(): UserRole | null {
  return localStorage.getItem(ROLE_KEY) as UserRole | null;
}

export function storeSession(token: string, role: UserRole): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ROLE_KEY, role);
}

export function clearStoredSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
}
