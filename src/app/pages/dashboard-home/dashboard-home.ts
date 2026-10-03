import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DashboardService } from '../../services/dashboard/dashboard';
import { ReportService } from '../../services/report/report';
import { DashboardData, DashboardStudent } from '../../models';
import {
  Button,
  Card,
  EmptyState,
  Icon,
  ProgressBar,
  Spinner,
  Presence,
  TablePager,
  pageOf,
  storedPageSize,
  storePageSize,
} from '../../shared/components';

@Component({
  selector: 'app-dashboard-home',
  imports: [FormsModule, Button, Card, EmptyState, Icon, Presence, ProgressBar, Spinner, TablePager],
  templateUrl: './dashboard-home.html',
  styleUrl: './dashboard-home.scss',
})
export class DashboardHome implements OnInit, OnDestroy {
  private dashboardService = inject(DashboardService);
  private reportService = inject(ReportService);
  private router = inject(Router);

  readonly data = signal<DashboardData | null>(null);
  readonly loading = signal(true);
  readonly exporting = signal(false);

  // ---- Class progress table: filters and paging ----
  readonly search = signal('');
  readonly levelFilter = signal('');
  readonly progressFilter = signal<'' | 'not-started' | 'reading' | 'finished'>('');
  readonly page = signal(1);
  readonly perPage = signal(storedPageSize('class-progress', 10));

  readonly levels = computed(() =>
    [...new Set((this.data()?.students ?? []).map((student) => student.reading_level).filter(Boolean) as string[])].sort(),
  );

  readonly filtersChanged = computed(
    () => !!(this.search().trim() || this.levelFilter() || this.progressFilter()),
  );

  readonly filteredStudents = computed(() => {
    const term = this.search().trim().toLowerCase();
    const level = this.levelFilter();
    const progress = this.progressFilter();

    return (this.data()?.students ?? []).filter(
      (student) =>
        (!term || student.full_name.toLowerCase().includes(term)) &&
        (!level || student.reading_level === level) &&
        (!progress ||
          (progress === 'not-started' && student.percent === 0) ||
          (progress === 'reading' && student.percent > 0 && student.percent < 100) ||
          (progress === 'finished' && student.percent >= 100)),
    );
  });

  readonly currentPage = computed(() =>
    Math.min(this.page(), Math.max(1, Math.ceil(this.filteredStudents().length / this.perPage()))),
  );

  readonly pagedStudents = computed(() =>
    pageOf(this.filteredStudents(), this.currentPage(), this.perPage()),
  );

  setSearch(value: string): void {
    this.search.set(value ?? '');
    this.page.set(1);
  }

  setLevel(value: string): void {
    this.levelFilter.set(value ?? '');
    this.page.set(1);
  }

  setProgress(value: '' | 'not-started' | 'reading' | 'finished'): void {
    this.progressFilter.set(value ?? '');
    this.page.set(1);
  }

  clearFilters(): void {
    this.search.set('');
    this.levelFilter.set('');
    this.progressFilter.set('');
    this.page.set(1);
  }

  setPageSize(size: number): void {
    this.perPage.set(size);
    storePageSize('class-progress', size);
    this.page.set(1);
  }

  initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  /** Re-read every minute, so "Here today" and "Active now" stay true to the room. */
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.refresh();
    this.refreshTimer = setInterval(() => this.refresh(), 60000);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
  }

  private refresh(): void {
    this.dashboardService.overview().subscribe({
      next: (response) => {
        this.data.set(response.data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  goProgress(student: DashboardStudent): void {
    this.router.navigate(['/dashboard/students', student.id, 'progress']);
  }

  goStudents(): void {
    this.router.navigate(['/dashboard/students']);
  }

  /** Download the whole-class progress report as a CSV. */
  exportClassReport(): void {
    this.exporting.set(true);
    this.reportService.downloadClassReport().subscribe({
      next: () => this.exporting.set(false),
      error: () => this.exporting.set(false),
    });
  }
}
