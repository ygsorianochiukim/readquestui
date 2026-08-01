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
  pron_score: number | null;
  is_validated: boolean;
  validated_at: string | null;
  created_at?: string;
}
