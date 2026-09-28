import { Book } from '../book/book.model';
import { BookPage } from '../book-page/book-page.model';

export type IngestStatus =
  | 'queued'
  | 'rasterizing'
  | 'analyzing'
  | 'reading'
  | 'ready'
  | 'committed'
  | 'failed';

/** One upload of reading material, from dropped file to published book. */
export interface IngestBatch {
  id: number;
  teacher_id: number;
  book_id: number | null;
  source_name: string;
  source_type: 'pdf' | 'images';
  status: IngestStatus;
  pages_total: number;
  pages_done: number;
  /** True when the pages could not be rendered and only their words survived. */
  text_only: boolean;
  error: string | null;
  percent: number;
  is_finished: boolean;
  created_at?: string;
  book?: Pick<Book, 'id' | 'title' | 'type' | 'status'> | null;
}

/** Where the segmenter thinks a chapter starts and what is in it. */
export interface SuggestedChapter {
  title: string;
  chapter_number: number;
  page_numbers: number[];
  story_text: string;
}

/** How a picture book's pages would be grouped into chapters. */
export interface SuggestedPart {
  title: string;
  chapter_number: number;
  page_numbers: number[];
}

/** What the teacher approves before anything is published. */
export interface IngestPreview {
  batch: IngestBatch;
  status_message: string;
  book: Book | null;
  pages: BookPage[];
  suggested_chapters: SuggestedChapter[];
  /** Picture-book grouping: every page lands in a chapter or part. */
  suggested_parts: SuggestedPart[];
  suggested_title: string | null;
}
