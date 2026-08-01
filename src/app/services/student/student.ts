import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, Student } from '../../models';

export interface StudentPayload {
  first_name: string;
  last_name: string;
  username: string;
  password?: string;
  reading_level?: string | null;
  status?: string;
}

@Injectable({ providedIn: 'root' })
export class StudentService {
  private http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/students`;

  list(): Observable<ApiResponse<Student[]>> {
    return this.http.get<ApiResponse<Student[]>>(this.base);
  }

  create(payload: StudentPayload): Observable<ApiResponse<Student>> {
    return this.http.post<ApiResponse<Student>>(this.base, payload);
  }

  update(id: number, payload: StudentPayload): Observable<ApiResponse<Student>> {
    return this.http.put<ApiResponse<Student>>(`${this.base}/${id}`, payload);
  }

  remove(id: number): Observable<unknown> {
    return this.http.delete(`${this.base}/${id}`);
  }
}
