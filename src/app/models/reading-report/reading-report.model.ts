import { ReadingPace } from '../pronunciation-attempt/pronunciation-attempt.model';

/** A word this child keeps getting wrong, and how often. */
export interface MissedWord {
  word: string;
  times_missed: number;
  average_accuracy: number | null;
  last_missed_at: string | null;
}

export interface ReadingTrendPoint {
  at: string | null;
  score: number;
  accuracy: number | null;
  fluency: number | null;
  diction: number | null;
  words_per_minute: number | null;
}

export interface ReadingSummary {
  total_attempts: number;
  passed_attempts: number;
  average_score: number | null;
  best_score: number | null;
  average_accuracy: number | null;
  average_fluency: number | null;
  average_completeness: number | null;
  average_prosody: number | null;
  average_diction: number | null;
  average_wpm: number | null;
  pace_counts: Record<ReadingPace, number>;
  awaiting_review: number;
  pass_mark: number;
}

export interface ReportAttempt {
  id: number;
  created_at: string | null;
  chapter_id: number | null;
  book_page_id: number | null;
  score: number | null;
  auto_score: number | null;
  teacher_score: number | null;
  teacher_note: string | null;
  accuracy_score: number | null;
  fluency_score: number | null;
  completeness_score: number | null;
  prosody_score: number | null;
  diction_score: number | null;
  words_per_minute: number | null;
  pace: ReadingPace | null;
  is_off_script: boolean;
  is_validated: boolean;
  passed: boolean;
  audio_url: string | null;
  missed_word_count: number;
}

export interface ReadingReport {
  student: { id: number; full_name: string; reading_level: string | null };
  summary: ReadingSummary;
  trend: ReadingTrendPoint[];
  missed_words: MissedWord[];
  attempts: ReportAttempt[];
  /** The words-per-minute window this child is judged against. */
  pace_band: { min_wpm: number; max_wpm: number };
}
