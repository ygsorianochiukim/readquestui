import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Downloadable CSV reports. The endpoints need the bearer token, so the file is
 * fetched as a blob and saved from memory rather than linked to directly.
 */
@Injectable({ providedIn: 'root' })
export class ReportService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  /** Whole-class summary, one row per student. */
  downloadClassReport(): Observable<Blob> {
    return this.http
      .get(`${this.base}/reports/class.csv`, { responseType: 'blob' })
      .pipe(tap((blob) => this.save(blob, 'readquest-class-report.csv')));
  }

  /** Full report for a single student. */
  downloadStudentReport(studentId: number, studentName: string): Observable<Blob> {
    const safeName = studentName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'student';

    return this.http
      .get(`${this.base}/reports/students/${studentId}.csv`, { responseType: 'blob' })
      .pipe(tap((blob) => this.save(blob, `readquest-report-${safeName}.csv`)));
  }

  private save(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
}
