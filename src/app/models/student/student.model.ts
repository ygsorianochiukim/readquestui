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
  /** Using the student app right now. */
  is_online?: boolean;
  /** Opened the app today. */
  is_present_today?: boolean;
  last_seen_at?: string | null;
  created_at?: string;
  updated_at?: string;
}
