/** How Azure judged one word of a reading. */
export type WordErrorType =
  | 'None'
  | 'Mispronunciation'
  | 'Omission'
  | 'Insertion'
  | 'UnexpectedBreak'
  | 'MissingBreak'
  | 'Monotone';

export interface PronunciationWord {
  id?: number;
  /** Position in the reference text — what the reader colours by. */
  word_index: number;
  word: string;
  accuracy_score: number | null;
  error_type: WordErrorType;
  /** Where the word sits in the recording, so it can be played back alone. */
  offset_ms: number | null;
  duration_ms: number | null;
  /** Accuracy of the child's single-word retry, when they had another go. */
  retry_accuracy?: number | null;
  retried_at?: string | null;
  /** True when a retry got the word right — the child fixed it afterwards. */
  is_corrected?: boolean;
}

/** Whether the child read at a sensible speed for their level. */
export type ReadingPace = 'too_slow' | 'good' | 'too_fast';

export interface PronunciationAttempt {
  id: number;
  student_id: number;
  book_page_id: number | null;
  chapter_id: number | null;
  /** Which paragraph of its page, when a chapter was read page by page. */
  paragraph_index?: number | null;
  reference_text: string;
  recognized_text: string | null;
  audio_url: string | null;
  accuracy_score: number | null;
  fluency_score: number | null;
  completeness_score: number | null;
  /** Intonation. Null on attempts recorded before prosody was switched on. */
  prosody_score: number | null;
  /**
   * Diction — how clearly each sound was articulated (mean phoneme accuracy).
   * Null on attempts recorded before phoneme scoring was switched on.
   */
  diction_score: number | null;
  /** Overall score, capped by text_match_score so an off-script read cannot pass. */
  pron_score: number | null;
  /** How much of what the pupil said matches the page text, 0-100. */
  text_match_score: number | null;
  /** True when the reading did not match the page at all. */
  is_off_script: boolean;
  words_per_minute: number | null;
  pace: ReadingPace | null;
  duration_ms: number | null;
  /** A teacher's own verdict, which overrides pron_score everywhere. */
  teacher_score: number | null;
  teacher_note: string | null;
  /** teacher_score when there is one, otherwise pron_score. Always read this. */
  effective_score: number | null;
  passed: boolean;
  is_validated: boolean;
  validated_at: string | null;
  created_at?: string;
  words?: PronunciationWord[];
  /** Only present on the teacher's queue, which loads them for the list. */
  student?: { id: number; first_name: string; last_name: string };
  chapter?: { id: number; chapter_number: number; title: string } | null;
  book_page?: { id: number; page_number: number } | null;
}

/** Something the child just earned, ready for the celebration modal. */
export interface EarnedReward {
  id: number;
  code?: string;
  name: string;
  description: string | null;
  icon: string | null;
  points: number;
}

export interface Celebrations {
  badges: EarnedReward[];
  achievements: EarnedReward[];
  milestone: 'page_completed' | 'chapter_completed' | 'book_completed' | null;
}

/** What comes back when a recording is submitted for scoring. */
/**
 * How far through reading a chapter aloud, page by page, the pupil is. The
 * chapter passes once every page is read and the best tries average out at
 * the pass mark.
 */
export interface ReadAloudSummary {
  pages_total: number;
  pages_read: number;
  average: number | null;
  passed: boolean;
  pages: { book_page_id: number; paragraph_index: number; best_score: number | null }[];
}

export interface AssessmentResponse {
  data: PronunciationAttempt;
  celebrations: Celebrations;
  meta: {
    pass_mark: number;
    pace_hint: string | null;
    /** Set when one paragraph of a chapter was read on its own. */
    read_aloud?: ReadAloudSummary | null;
  };
}
