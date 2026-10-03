import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DashboardService } from '../../services/dashboard/dashboard';
import { ReportService } from '../../services/report/report';
import { ChapterNode, StudentProgressReport } from '../../models';
import {
  Button,
  Card,
  EmptyState,
  Icon,
  ProgressBar,
  Spinner,
  StatusIndicator,
  TablePager,
  pageOf,
  storedPageSize,
  storePageSize,
} from '../../shared/components';

@Component({
  selector: 'app-student-progress',
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    Button,
    Card,
    EmptyState,
    Icon,
    ProgressBar,
    Spinner,
    StatusIndicator,
    TablePager,
  ],
  templateUrl: './student-progress.html',
  styleUrl: './student-progress.scss',
})
export class StudentProgress implements OnInit {
  private dashboardService = inject(DashboardService);
  private reportService = inject(ReportService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly studentId = Number(this.route.snapshot.paramMap.get('studentId'));
  readonly report = signal<StudentProgressReport | null>(null);
  readonly loading = signal(true);
  readonly exporting = signal(false);

  // ---- Read-aloud history table: filter and paging ----
  readonly resultFilter = signal<'' | 'passed' | 'failed' | 'validated' | 'unvalidated'>('');
  readonly page = signal(1);
  readonly perPage = signal(storedPageSize('read-aloud-history', 10));

  readonly filteredAttempts = computed(() => {
    const filter = this.resultFilter();

    return (this.report()?.pronunciation ?? []).filter(
      (attempt) =>
        !filter ||
        (filter === 'passed' && attempt.passed) ||
        (filter === 'failed' && !attempt.passed) ||
        (filter === 'validated' && attempt.is_validated) ||
        (filter === 'unvalidated' && !attempt.is_validated),
    );
  });

  readonly currentPage = computed(() =>
    Math.min(this.page(), Math.max(1, Math.ceil(this.filteredAttempts().length / this.perPage()))),
  );

  readonly pagedAttempts = computed(() =>
    pageOf(this.filteredAttempts(), this.currentPage(), this.perPage()),
  );

  setResultFilter(value: '' | 'passed' | 'failed' | 'validated' | 'unvalidated'): void {
    this.resultFilter.set(value ?? '');
    this.page.set(1);
  }

  setPageSize(size: number): void {
    this.perPage.set(size);
    storePageSize('read-aloud-history', size);
    this.page.set(1);
  }

  /** The chapter's state, as the shared status tag shows it. */
  chapterStatus(chapter: ChapterNode): 'completed' | 'in-progress' | 'locked' | null {
    if (chapter.progress?.status === 'completed') {
      return 'completed';
    }
    if (chapter.progress?.status === 'in_progress') {
      return 'in-progress';
    }
    return chapter.is_locked ? 'locked' : null;
  }

  ngOnInit(): void {
    this.dashboardService.studentProgress(this.studentId).subscribe({
      next: (response) => {
        this.report.set(response.data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }


  back(): void {
    this.router.navigate(['/dashboard/students']);
  }

  print(): void {
    window.print();
  }

  /** Download this student's full report as a CSV. */
  exportCsv(): void {
    const student = this.report()?.student;
    if (!student) {
      return;
    }

    this.exporting.set(true);
    this.reportService.downloadStudentReport(student.id, student.full_name).subscribe({
      next: () => this.exporting.set(false),
      error: () => this.exporting.set(false),
    });
  }
}
