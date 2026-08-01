import { BookPage } from '../book-page/book-page.model';
import { Chapter } from '../chapter/chapter.model';

export type BookType = 'standard' | 'scanned';

export interface Book {
  id: number;
  title: string;
  type: BookType;
  description: string | null;
  cover_image_url: string | null;
  reading_level: string | null;
  sequence: number;
  status: string;
  chapters_count?: number;
  pages_count?: number;
  pages?: BookPage[];
  chapters?: Chapter[];
  created_at?: string;
  updated_at?: string;
}
