export interface Student {
  id: number;
  teacher_id: number;
  first_name: string;
  last_name: string;
  username: string;
  reading_level: string | null;
  points?: number;
  status: string;
  profile_image_url: string | null;
  created_at?: string;
  updated_at?: string;
}
