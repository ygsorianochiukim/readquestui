import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, Badge } from '../../models';

export interface BadgePayload {
  name: string;
  description?: string | null;
  icon?: string | null;
  criteria?: string | null;
  points?: number;
  status?: string;
}

@Injectable({ providedIn: 'root' })
export class BadgeService {
  private http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/badges`;

  list(): Observable<ApiResponse<Badge[]>> {
    return this.http.get<ApiResponse<Badge[]>>(this.base);
  }

  create(payload: BadgePayload): Observable<ApiResponse<Badge>> {
    return this.http.post<ApiResponse<Badge>>(this.base, payload);
  }

  update(id: number, payload: BadgePayload): Observable<ApiResponse<Badge>> {
    return this.http.put<ApiResponse<Badge>>(`${this.base}/${id}`, payload);
  }

  remove(id: number): Observable<unknown> {
    return this.http.delete(`${this.base}/${id}`);
  }
}
