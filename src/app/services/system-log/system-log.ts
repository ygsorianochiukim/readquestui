import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SystemLogPage } from '../../models';

export interface SystemLogFilters {
  action?: string;
  studentId?: number | null;
  search?: string;
  page?: number;
  perPage?: number;
}

/** The audit trail a teacher can review (their actions + their students'). */
@Injectable({ providedIn: 'root' })
export class SystemLogService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  list(filters: SystemLogFilters = {}): Observable<SystemLogPage> {
    let params = new HttpParams();

    if (filters.action) {
      params = params.set('action', filters.action);
    }
    if (filters.studentId) {
      params = params.set('student_id', filters.studentId);
    }
    if (filters.search) {
      params = params.set('search', filters.search);
    }
    if (filters.page) {
      params = params.set('page', filters.page);
    }
    if (filters.perPage) {
      params = params.set('per_page', filters.perPage);
    }

    return this.http.get<SystemLogPage>(`${this.base}/system-logs`, { params });
  }
}
