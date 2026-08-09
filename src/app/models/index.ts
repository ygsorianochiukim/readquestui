// Barrel file: import any model from one place, e.g.
//   import { Student, Book } from '../../models';

export type { ApiResponse } from './api-response/api-response.model';
export type { Teacher } from './teacher/teacher.model';
export type { Student } from './student/student.model';
export type { Book, BookType } from './book/book.model';
export type { BookPage } from './book-page/book-page.model';
export type { Badge } from './badge/badge.model';
export type { Achievement, AchievementSummary } from './achievement/achievement.model';
export type { PageProgressNode, BookPageProgress } from './page-progress/page-progress.model';
export type { SystemLog, SystemLogPage } from './system-log/system-log.model';
export type { Chapter } from './chapter/chapter.model';
export type { QuizQuestion } from './quiz-question/quiz-question.model';
export type { PronunciationAttempt } from './pronunciation-attempt/pronunciation-attempt.model';
export type {
  ProgressStatus,
  ChapterProgress,
  BookOverview,
  ChapterNode,
  BookProgress,
  StudentQuizQuestion,
  QuizReviewItem,
  QuizResult,
  DashboardStudent,
  DashboardData,
  StudentProgressReport,
} from './progress/progress.model';
