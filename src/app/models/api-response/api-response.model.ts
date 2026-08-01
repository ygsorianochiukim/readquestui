/** Standard envelope returned by the ReadQuest API: { data: ... }. */
export interface ApiResponse<T> {
  data: T;
}
