import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SystemLogService } from '../../services/system-log/system-log';
import { StudentService } from '../../services/student/student';
import { Student, SystemLog } from '../../models';
import { Card, EmptyState, PageHeader, Spinner, Icon } from '../../shared/components';

@Component({
  selector: 'app-system-logs',
  imports: [DatePipe, FormsModule, Card, EmptyState, PageHeader, Spinner, Icon],
  templateUrl: './system-logs.html',
  styleUrl: './system-logs.scss',
})
export class SystemLogs implements OnInit {
  private logService = inject(SystemLogService);
  private studentService = inject(StudentService);

  readonly logs = signal<SystemLog[]>([]);
  readonly actions = signal<string[]>([]);
  readonly students = signal<Student[]>([]);
  readonly loading = signal(true);

  readonly page = signal(1);
  readonly lastPage = signal(1);
  readonly total = signal(0);

  action = '';
  studentId = '';
  search = '';

  ngOnInit(): void {
    this.studentService.list().subscribe({
      next: (response) => this.students.set(response.data),
      error: () => {},
    });

    this.load();
  }

  load(page = 1): void {
    this.loading.set(true);
    this.page.set(page);

    this.logService
      .list({
        action: this.action || undefined,
        studentId: this.studentId ? Number(this.studentId) : null,
        search: this.search || undefined,
        page,
      })
      .subscribe({
        next: (response) => {
          this.logs.set(response.data);
          this.actions.set(response.actions);
          this.lastPage.set(response.meta.last_page);
          this.total.set(response.meta.total);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  applyFilters(): void {
    this.load(1);
  }

  clearFilters(): void {
    this.action = '';
    this.studentId = '';
    this.search = '';
    this.load(1);
  }

  previous(): void {
    if (this.page() > 1) {
      this.load(this.page() - 1);
    }
  }

  next(): void {
    if (this.page() < this.lastPage()) {
      this.load(this.page() + 1);
    }
  }

  /** Group actions by prefix so the badge colour hints at what happened. */
  tone(action: string): string {
    const [group] = action.split('.');
    switch (group) {
      case 'teacher':
        return 'teacher';
      case 'student':
        return 'student';
      case 'badge':
      case 'achievement':
        return 'reward';
      case 'quiz':
      case 'chapter':
        return 'learning';
      case 'pronunciation':
        return 'speech';
      default:
        return 'default';
    }
  }

  label(action: string): string {
    return action.replace(/[._]/g, ' ');
  }
}
