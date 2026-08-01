import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DashboardService } from '../../services/dashboard/dashboard';
import { DashboardData, DashboardStudent } from '../../models';
import { Button, Card, EmptyState, ProgressBar, Spinner } from '../../shared/components';

@Component({
  selector: 'app-dashboard-home',
  imports: [Button, Card, EmptyState, ProgressBar, Spinner],
  templateUrl: './dashboard-home.html',
  styleUrl: './dashboard-home.scss',
})
export class DashboardHome implements OnInit {
  private dashboardService = inject(DashboardService);
  private router = inject(Router);

  readonly data = signal<DashboardData | null>(null);
  readonly loading = signal(true);

  ngOnInit(): void {
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
}
