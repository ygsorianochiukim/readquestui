export interface PronunciationAttempt {
  id: number;
  student_id: number;
  book_page_id: number | null;
  chapter_id: number | null;
  reference_text: string;
  recognized_text: string | null;
  audio_url: string | null;
  accuracy_score: number | null;
  fluency_score: number | null;
  completeness_score: number | null;
  /** Overall score, capped by text_match_score so an off-script read cannot pass. */
  pron_score: number | null;
  /** How much of what the pupil said matches the page text, 0-100. */
  text_match_score: number | null;
  /** True when the reading did not match the page at all. */
  is_off_script: boolean;
  is_validated: boolean;
  validated_at: string | null;
  created_at?: string;
}
