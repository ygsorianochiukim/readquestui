export interface QuizQuestion {
  id: number;
  chapter_id: number;
  question_text: string;
  choices: string[];
  correct_answer: string;
  created_at?: string;
  updated_at?: string;
}
