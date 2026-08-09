import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AchievementSummary, ApiResponse } from '../../models';

/** Achievement milestones — earned from tracked progress, never handed out. */
@Injectable({ providedIn: 'root' })
export class AchievementService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  /** The signed-in student's own milestones. */
  mine(): Observable<ApiResponse<AchievementSummary>> {
    return this.http.get<ApiResponse<AchievementSummary>>(`${this.base}/student/achievements`);
  }

  /** Teacher view of one student's milestones. */
  forStudent(studentId: number): Observable<ApiResponse<AchievementSummary>> {
    return this.http.get<ApiResponse<AchievementSummary>>(
      `${this.base}/students/${studentId}/achievements`,
    );
  }
}
