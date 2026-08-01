export interface BookPage {
  id: number;
  book_id: number;
  page_number: number;
  image_url: string | null;
  text: string | null;
  created_at?: string;
  updated_at?: string;
}
