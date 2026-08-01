import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, DashboardData, StudentProgressReport } from '../../models';

/** Teacher dashboard stats + per-student progress monitoring / reports. */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  overview(): Observable<ApiResponse<DashboardData>> {
    return this.http.get<ApiResponse<DashboardData>>(`${this.base}/dashboard`);
  }

  studentProgress(studentId: number): Observable<ApiResponse<StudentProgressReport>> {
    return this.http.get<ApiResponse<StudentProgressReport>>(
      `${this.base}/students/${studentId}/progress`,
    );
  }
}
