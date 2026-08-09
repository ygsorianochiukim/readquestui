import { Routes } from '@angular/router';
import { authGuard, guestGuard, studentGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: 'student/login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/student-login/student-login').then((m) => m.StudentLogin),
  },
  {
    path: 'student',
    canActivate: [studentGuard],
    loadComponent: () => import('./layout/student-layout').then((m) => m.StudentLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      {
        path: 'home',
        data: { title: 'Home' },
        loadComponent: () => import('./pages/student-home/student-home').then((m) => m.StudentHome),
      },
      {
        path: 'library',
        data: { title: 'Library' },
        loadComponent: () =>
          import('./pages/student-library/student-library').then((m) => m.StudentLibrary),
      },
      {
        path: 'achievements',
        data: { title: 'Achievements' },
        loadComponent: () =>
          import('./pages/student-achievements/student-achievements').then(
            (m) => m.StudentAchievements,
          ),
      },
      {
        path: 'books/:bookId',
        data: { title: 'Reading' },
        loadComponent: () => import('./pages/student-book/student-book').then((m) => m.StudentBook),
      },
      {
        path: 'books/:bookId/chapters/:chapterId',
        data: { title: 'Chapter' },
        loadComponent: () =>
          import('./pages/chapter-activities/chapter-activities').then((m) => m.ChapterActivities),
      },
      {
        path: 'read/:bookId',
        data: { title: 'Reading' },
        loadComponent: () => import('./pages/book-reader/book-reader').then((m) => m.BookReader),
      },
    ],
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/layout').then((m) => m.Layout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      {
        path: 'home',
        data: { title: 'Dashboard' },
        loadComponent: () =>
          import('./pages/dashboard-home/dashboard-home').then((m) => m.DashboardHome),
      },
      {
        path: 'students',
        data: { title: 'Students' },
        loadComponent: () => import('./pages/students/students').then((m) => m.Students),
      },
      {
        path: 'students/:studentId/progress',
        data: { title: 'Student Progress' },
        loadComponent: () =>
          import('./pages/student-progress/student-progress').then((m) => m.StudentProgress),
      },
      {
        path: 'profile',
        data: { title: 'My Profile' },
        loadComponent: () => import('./pages/profile/profile').then((m) => m.Profile),
      },
      {
        path: 'books',
        data: { title: 'Books & Content' },
        loadComponent: () => import('./pages/books/books').then((m) => m.Books),
      },
      {
        path: 'badges',
        data: { title: 'Badges & Rewards' },
        loadComponent: () => import('./pages/badges/badges').then((m) => m.Badges),
      },
      {
        path: 'activity-log',
        data: { title: 'Activity Log' },
        loadComponent: () => import('./pages/system-logs/system-logs').then((m) => m.SystemLogs),
      },
      {
        path: 'books/:bookId/chapters',
        data: { title: 'Chapters' },
        loadComponent: () => import('./pages/chapters/chapters').then((m) => m.Chapters),
      },
      {
        path: 'books/:bookId/pages',
        data: { title: 'Book Pages' },
        loadComponent: () => import('./pages/book-pages/book-pages').then((m) => m.BookPages),
      },
      {
        path: 'chapters/:chapterId/quiz',
        data: { title: 'Quiz Questions' },
        loadComponent: () =>
          import('./pages/quiz-questions/quiz-questions').then((m) => m.QuizQuestions),
      },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' },
];
