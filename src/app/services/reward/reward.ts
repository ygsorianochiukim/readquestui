import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Badge } from '../../models';

/** A student's earned badges plus their total points. */
export interface RewardSummary {
  data: Badge[];
  points: number;
}

@Injectable({ providedIn: 'root' })
export class RewardService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  /** Teacher: badges a specific student has earned. */
  forStudent(studentId: number): Observable<RewardSummary> {
    return this.http.get<RewardSummary>(`${this.base}/students/${studentId}/badges`);
  }

  /** Teacher: award a badge to a student. */
  award(studentId: number, badgeId: number): Observable<RewardSummary> {
    return this.http.post<RewardSummary>(
      `${this.base}/students/${studentId}/badges/${badgeId}`,
      {},
    );
  }

  /** Teacher: remove a badge from a student. */
  revoke(studentId: number, badgeId: number): Observable<RewardSummary> {
    return this.http.delete<RewardSummary>(`${this.base}/students/${studentId}/badges/${badgeId}`);
  }

  /** Student: the logged-in student's own badges and points. */
  mine(): Observable<RewardSummary> {
    return this.http.get<RewardSummary>(`${this.base}/student/badges`);
  }
}
