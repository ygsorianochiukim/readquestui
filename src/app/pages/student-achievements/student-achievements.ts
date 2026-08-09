import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { AchievementService } from '../../services/achievement/achievement';
import { Achievement, AchievementSummary } from '../../models';
import { Spinner, Icon } from '../../shared/components';

type Filter = 'all' | 'unlocked' | 'locked';

@Component({
  selector: 'app-student-achievements',
  imports: [Spinner, Icon],
  templateUrl: './student-achievements.html',
  styleUrl: './student-achievements.scss',
})
export class StudentAchievements implements OnInit {
  private achievementService = inject(AchievementService);

  readonly summary = signal<AchievementSummary | null>(null);
  readonly loading = signal(true);
  readonly filter = signal<Filter>('all');

  readonly percent = computed(() => {
    const summary = this.summary();
    if (!summary || summary.total === 0) {
      return 0;
    }
    return Math.round((summary.unlocked / summary.total) * 100);
  });

  /** The achievement closest to unlocking — what to chase next. */
  readonly nextUp = computed(() => {
    const locked = (this.summary()?.achievements ?? []).filter(
      (achievement) => !achievement.is_unlocked,
    );
    return locked.sort((first, second) => second.percent - first.percent)[0] ?? null;
  });

  readonly visible = computed(() => {
    const achievements = this.summary()?.achievements ?? [];
    switch (this.filter()) {
      case 'unlocked':
        return achievements.filter((achievement) => achievement.is_unlocked);
      case 'locked':
        return achievements.filter((achievement) => !achievement.is_unlocked);
      default:
        return achievements;
    }
  });

  ngOnInit(): void {
    this.achievementService.mine().subscribe({
      next: (response) => {
        this.summary.set(response.data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  setFilter(filter: Filter): void {
    this.filter.set(filter);
  }

  goal(achievement: Achievement): string {
    return `${achievement.current} / ${achievement.threshold} ${achievement.metric_label}`;
  }
}
