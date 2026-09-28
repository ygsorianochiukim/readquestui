export interface Chapter {
  id: number;
  book_id: number;
  chapter_number: number;
  title: string;
  /** Read off the scanned pages. Null for a picture book's chapter. */
  story_text: string | null;
  image_url: string | null;
  audio_url: string | null;
  quiz_questions_count?: number;
  /** How many page scans the chapter holds (a picture book's content). */
  pages_count?: number;
  created_at?: string;
  updated_at?: string;
}
