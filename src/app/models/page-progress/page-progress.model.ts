/** A pupil's progress on one page of a page-based (scanned) book. */
export interface PageProgressNode {
  id: number;
  page_number: number;
  has_text: boolean;
  is_read: boolean;
  pronunciation_passed: boolean;
  best_score: number | null;
  is_completed: boolean;
}

/** Progress across every page of one scanned book. */
export interface BookPageProgress {
  pages: PageProgressNode[];
  total_pages: number;
  completed_pages: number;
  percent: number;
  is_completed: boolean;
}
