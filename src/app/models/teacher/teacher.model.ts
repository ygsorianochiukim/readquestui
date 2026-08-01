export interface Teacher {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string | null;
  status: string;
  profile_image_url: string | null;
  created_at?: string;
  updated_at?: string;
}
