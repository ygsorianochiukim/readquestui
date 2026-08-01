import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DashboardService } from '../../services/dashboard/dashboard';
import { ChapterNode, StudentProgressReport } from '../../models';
import { Button, Card, ProgressBar, Spinner } from '../../shared/components';

@Component({
  selector: 'app-student-progress',
  imports: [Button, Card, ProgressBar, Spinner],
  templateUrl: './student-progress.html',
  styleUrl: './student-progress.scss',
})
export class StudentProgress implements OnInit {
  private dashboardService = inject(DashboardService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly studentId = Number(this.route.snapshot.paramMap.get('studentId'));
  readonly report = signal<StudentProgressReport | null>(null);
  readonly loading = signal(true);

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

  activityMark(done: boolean | undefined): string {
    return done ? '✓' : '—';
  }

  back(): void {
    this.router.navigate(['/dashboard/students']);
  }

  print(): void {
    window.print();
  }
}
