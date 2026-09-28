import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { PronunciationService } from '../../services/pronunciation/pronunciation';
import { MissedWord, ReadingReport, ReportAttempt } from '../../models';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Icon,
  PageHeader,
  ProgressBar,
  Spinner,
  StatusIndicator,
} from '../../shared/components';

/**
 * One child's reading report.
 *
 * The question a teacher actually arrives with is "which words is this child
 * stuck on", so that is the top of the page — not the average score, which
 * tells them a child is struggling without telling them what to do about it.
 */
@Component({
  selector: 'app-student-reading-report',
  imports: [
    DecimalPipe,
    Alert,
    Button,
    Card,
    EmptyState,
    Icon,
    PageHeader,
    ProgressBar,
    Spinner,
    StatusIndicator,
  ],
  templateUrl: './student-reading-report.html',
  styleUrl: './student-reading-report.scss',
})
export class StudentReadingReport implements OnInit {
  private service = inject(PronunciationService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly studentId = Number(this.route.snapshot.paramMap.get('studentId'));
  readonly report = signal<ReadingReport | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly summary = computed(() => this.report()?.summary ?? null);
  readonly trend = computed(() => this.report()?.trend ?? []);

  /** Pass rate, for the headline. */
  readonly passRate = computed(() => {
    const summary = this.summary();

    if (!summary || summary.total_attempts === 0) {
      return null;
    }

    return Math.round((summary.passed_attempts / summary.total_attempts) * 100);
  });

  /**
   * The trend as points on a 0-100 chart.
   *
   * Drawn as an inline polyline rather than pulled in as a charting library:
   * it is one series of at most thirty numbers, and a teacher only needs to see
   * whether the line goes up.
   */
  readonly trendPoints = computed(() => {
    const trend = this.trend();

    if (trend.length < 2) {
      return '';
    }

    return trend
      .map((point, index) => {
        const x = (index / (trend.length - 1)) * 100;
        const y = 100 - Math.max(0, Math.min(100, point.score));

        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  });

  /** Where the pass mark sits on that chart. */
  readonly passLine = computed(() => 100 - (this.summary()?.pass_mark ?? 60));

  ngOnInit(): void {
    this.service.report(this.studentId).subscribe({
      next: (response) => {
        this.report.set(response.data);
        this.loading.set(false);
      },
      error: (response: HttpErrorResponse) => {
        this.errorMessage.set(
          response.error?.message ?? 'Could not load this pupil’s reading report.',
        );
        this.loading.set(false);
      },
    });
  }

  /** How hard a word is for this child, as a share of their worst one. */
  missShare(word: MissedWord): number {
    const worst = this.report()?.missed_words[0]?.times_missed ?? 1;

    return Math.round((word.times_missed / Math.max(1, worst)) * 100);
  }

  attemptState(attempt: ReportAttempt): 'passed' | 'failed' {
    return attempt.passed ? 'passed' : 'failed';
  }

  paceLabel(attempt: ReportAttempt): string | null {
    switch (attempt.pace) {
      case 'too_slow':
        return 'slow';
      case 'too_fast':
        return 'fast';
      case 'good':
        return 'steady';
      default:
        return null;
    }
  }

  back(): void {
    this.router.navigate(['/dashboard/students']);
  }

  print(): void {
    window.print();
  }
}
