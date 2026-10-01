import { ThemeKey } from '../theme/theme.model';

import { AchievementSummary } from '../achievement/achievement.model';
import { Badge } from '../badge/badge.model';
import { PronunciationAttempt } from '../pronunciation-attempt/pronunciation-attempt.model';

export type ProgressStatus = 'not_started' | 'in_progress' | 'completed';

/** The four chapter activities + resulting completion state for one chapter. */
export interface ChapterProgress {
  status: ProgressStatus;
  story_read: boolean;
  pronunciation_passed: boolean;
  game_completed: boolean;
  quiz_passed: boolean;
  quiz_score: number | null;
  completed_at: string | null;
}

/** A book in the student's overview (library), with completion + lock state. */
export interface BookOverview {
  id: number;
  title: string;
  theme: ThemeKey | null;
  description: string | null;
  cover_image_url: string | null;
  reading_level: string | null;
  sequence: number;
  type: 'standard' | 'scanned';
  total_chapters: number;
  completed_chapters: number;
  /** Page books are measured in pages; chapter books report zero here. */
  total_pages: number;
  completed_pages: number;
  percent: number;
  is_locked: boolean;
  is_completed: boolean;
  current_chapter_id: number | null;
  /** Page books only: the chapters their pages are grouped into, if any. */
  page_chapters?: PageChapter[];
}

/** A group of pages inside a page (scanned) book, with the student's progress. */
export interface PageChapter {
  id: number;
  title: string;
  /** Null: read in the book's theme. */
  theme: ThemeKey | null;
  sequence: number;
  page_count: number;
  pages_completed: number;
  first_page_id: number | null;
}

/** A chapter row within a book, annotated with the student's progress + lock. */
export interface ChapterNode {
  id: number;
  chapter_number: number;
  title: string;
  /** Null: read in the book's theme. */
  theme: ThemeKey | null;
  image_url: string | null;
  has_quiz: boolean;
  is_locked: boolean;
  progress: ChapterProgress | null;
}

export interface BookProgress {
  id: number;
  title: string;
  type?: 'standard' | 'scanned';
  theme: ThemeKey | null;
  description: string | null;
  reading_level: string | null;
  chapters: ChapterNode[];
}

/** Quiz question shown to a student (no correct answer included). */
export interface StudentQuizQuestion {
  id: number;
  question_text: string;
  choices: string[];
}

export interface QuizReviewItem {
  question_id: number;
  correct_answer: string;
  given_answer: string | null;
  is_correct: boolean;
  /** Same as given_answer / is_correct, under the names the summary reads. */
  selected: string | null;
  correct: boolean;
}

/** The instant verdict on one quiz answer, revealed only after a guess. */
export interface QuizAnswerCheck {
  correct: boolean;
  correct_answer: string;
}

/** The three mini-games every chapter offers. */
export type GameType = 'scramble' | 'missing-word' | 'sentence-builder';

/** A mini-game already won on a chapter, and what its first win paid. */
export interface GameWinRecord {
  game_type: GameType;
  points_awarded: number;
  perfect: boolean;
  completed_at: string | null;
}

/** What winning a mini-game earned. Points are paid on the first win only. */
export interface GameWin {
  game_type: GameType;
  points_earned: number;
  first_completion: boolean;
  perfect: boolean;
  games: GameWinRecord[];
  total_points: number;
}

export interface QuizResult {
  score: number;
  correct: number;
  total: number;
  passed: boolean;
  review: QuizReviewItem[];
  progress: ChapterProgress;
}

// ---- Teacher monitoring / dashboard ----

export interface DashboardStudent {
  id: number;
  full_name: string;
  reading_level: string | null;
  status: string;
  points: number;
  assigned_books: number;
  completed_books: number;
  percent: number;
}

export interface DashboardData {
  stats: {
    students: number;
    active_books: number;
    pending_validations: number;
    average_completion: number;
  };
  students: DashboardStudent[];
}

export interface StudentProgressReport {
  student: {
    id: number;
    full_name: string;
    username: string;
    reading_level: string | null;
    status: string;
    points: number;
  };
  progress: {
    books: Array<{
      id: number;
      title: string;
      reading_level: string | null;
      total_chapters: number;
      completed_chapters: number;
      chapters: ChapterNode[];
    }>;
    total_chapters: number;
    completed_chapters: number;
    percent: number;
  };
  badges: Badge[];
  achievements: AchievementSummary;
  pronunciation: PronunciationAttempt[];
}
