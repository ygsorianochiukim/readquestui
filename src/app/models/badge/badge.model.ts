export interface Badge {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  criteria: string | null;
  points: number;
  status: string;
  // Present when the badge was loaded as a student's *earned* badge.
  pivot?: {
    earned_at: string | null;
  };
  created_at?: string;
  updated_at?: string;
}
