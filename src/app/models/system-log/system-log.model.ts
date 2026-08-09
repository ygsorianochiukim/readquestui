/** One entry in the audit trail. */
export interface SystemLog {
  id: number;
  student_id: number | null;
  teacher_id: number | null;
  action: string;
  description: string | null;
  ip_address: string | null;
  /** Name of whoever triggered the entry, resolved by the API. */
  actor: string;
  created_at: string;
}

export interface SystemLogPage {
  data: SystemLog[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
  /** Distinct action names present in this teacher's log, for filtering. */
  actions: string[];
}
