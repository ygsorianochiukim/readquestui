export interface QuizQuestion {
  id: number;
  chapter_id: number;
  question_text: string;
  choices: string[];
  correct_answer: string;
  /** True when written from the chapter text; false once a teacher edits it. */
  is_generated: boolean;
  created_at?: string;
  updated_at?: string;
}
