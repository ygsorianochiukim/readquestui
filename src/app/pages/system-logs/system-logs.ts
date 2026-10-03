import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SystemLogService } from '../../services/system-log/system-log';
import { StudentService } from '../../services/student/student';
import { Student, SystemLog } from '../../models';
import {
  Button,
  Card,
  EmptyState,
  Icon,
  PageHeader,
  Spinner,
  TablePager,
  storedPageSize,
  storePageSize,
} from '../../shared/components';

@Component({
  selector: 'app-system-logs',
  imports: [DatePipe, FormsModule, Button, Card, EmptyState, Icon, PageHeader, Spinner, TablePager],
  templateUrl: './system-logs.html',
  styleUrl: './system-logs.scss',
})
export class SystemLogs implements OnInit, OnDestroy {
  private logService = inject(SystemLogService);
  private studentService = inject(StudentService);

  readonly logs = signal<SystemLog[]>([]);
  readonly actions = signal<string[]>([]);
  readonly students = signal<Student[]>([]);
  readonly loading = signal(true);

  readonly page = signal(1);
  readonly total = signal(0);
  readonly perPage = signal(storedPageSize('activity-log', 20));

  readonly action = signal('');
  readonly studentId = signal('');
  readonly search = signal('');

  readonly filtersChanged = computed(() => !!(this.action() || this.studentId() || this.search()));

  /** Searching waits for a pause in typing rather than asking on every key. */
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.studentService.list().subscribe({
      next: (response) => this.students.set(response.data),
      error: () => {},
    });

    this.load();
  }

  ngOnDestroy(): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
  }

  load(page = 1): void {
    this.loading.set(true);
    this.page.set(page);

    this.logService
      .list({
        action: this.action() || undefined,
        studentId: this.studentId() ? Number(this.studentId()) : null,
        search: this.search() || undefined,
        page,
        perPage: this.perPage(),
      })
      .subscribe({
        next: (response) => {
          this.logs.set(response.data);
          this.actions.set(response.actions);
          this.page.set(response.meta.current_page);
          this.total.set(response.meta.total);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  onSearch(value: string): void {
    this.search.set(value);
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => this.load(1), 350);
  }

  clearFilters(): void {
    this.action.set('');
    this.studentId.set('');
    this.search.set('');
    this.load(1);
  }

  setPageSize(size: number): void {
    this.perPage.set(size);
    storePageSize('activity-log', size);
    this.load(1);
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
