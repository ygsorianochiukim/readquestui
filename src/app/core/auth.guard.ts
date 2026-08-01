import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { getRole, getToken } from './session';

/** Allow only logged-in teachers. */
export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  if (getToken() && getRole() === 'teacher') {
    return true;
  }
  return router.createUrlTree(['/login']);
};

/** Allow only logged-in students. */
export const studentGuard: CanActivateFn = () => {
  const router = inject(Router);
  if (getToken() && getRole() === 'student') {
    return true;
  }
  return router.createUrlTree(['/student/login']);
};

/** Allow only logged-out visitors; send logged-in users to their home page. */
export const guestGuard: CanActivateFn = () => {
  const router = inject(Router);
  if (!getToken()) {
    return true;
  }
  return router.createUrlTree([getRole() === 'student' ? '/student' : '/dashboard']);
};
