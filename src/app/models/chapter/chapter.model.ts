export interface Chapter {
  id: number;
  book_id: number;
  chapter_number: number;
  title: string;
  story_text: string | null;
  image_url: string | null;
  audio_url: string | null;
  quiz_questions_count?: number;
  created_at?: string;
  updated_at?: string;
}
