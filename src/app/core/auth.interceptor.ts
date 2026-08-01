import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { clearStoredSession, getRole, getToken } from './session';

/**
 * Attaches the Bearer token to outgoing API calls. If an authenticated
 * request comes back 401, the session is cleared and the user is sent to
 * the login page that matches their role. A 401 on a login attempt (no
 * token was sent) is left alone so the form can show its own error.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const token = getToken();

  const request = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && token) {
        const role = getRole();
        clearStoredSession();
        router.navigate([role === 'student' ? '/student/login' : '/login']);
      }
      return throwError(() => error);
    }),
  );
};
