/** A milestone a student works toward, with their progress so far. */
export interface Achievement {
  id: number;
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  metric: string;
  /** Friendly name of what the metric counts, e.g. "chapters finished". */
  metric_label: string;
  threshold: number;
  points: number;
  current: number;
  percent: number;
  is_unlocked: boolean;
  unlocked_at: string | null;
}

/** The whole catalog for one student, plus their raw metric totals. */
export interface AchievementSummary {
  achievements: Achievement[];
  unlocked: number;
  total: number;
  metrics: Record<string, number>;
}
