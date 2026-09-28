export interface BookPage {
  id: number;
  book_id: number;
  /** The chapter the page belongs to — every book is Book → Chapters → Pages. */
  chapter_id: number | null;
  page_number: number;
  image_url: string | null;
  text: string | null;
  created_at?: string;
  updated_at?: string;
}

/** A chapter heading in the page list, so pages can be grouped under it. */
export interface BookPageChapter {
  id: number;
  book_id: number;
  chapter_number: number;
  title: string;
}
