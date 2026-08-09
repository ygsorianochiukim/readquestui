import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DashboardService } from '../../services/dashboard/dashboard';
import { ReportService } from '../../services/report/report';
import { ChapterNode, StudentProgressReport } from '../../models';
import { Button, Card, ProgressBar, Spinner, Icon } from '../../shared/components';

@Component({
  selector: 'app-student-progress',
  imports: [Button, Card, ProgressBar, Spinner, Icon],
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

  ngOnInit(): void {
    this.dashboardService.studentProgress(this.studentId).subscribe({
      next: (response) => {
        this.report.set(response.data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  chapterState(chapter: ChapterNode): string {
    if (chapter.progress?.status === 'completed') {
      return 'Completed';
    }
    if (chapter.progress?.status === 'in_progress') {
      return 'In progress';
    }
    if (chapter.is_locked) {
      return 'Locked';
    }
    return 'Not started';
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
