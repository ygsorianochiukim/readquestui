import { Component, computed, input } from '@angular/core';
import { Icon } from '../icon/icon';
import { IconName } from '../icon/icons';

/**
 * Every state the app can be in, named once.
 *
 * Before this, "loading", "passed" and "correct" were each drawn three or four
 * different ways depending on which screen you were on. One component means a
 * child learns what a tick means in one place and it means the same everywhere.
 */
export type Status =
  | 'correct'
  | 'incorrect'
  | 'passed'
  | 'failed'
  | 'loading'
  | 'pending'
  | 'completed'
  | 'locked'
  | 'in-progress';

const PRESETS: Record<Status, { icon: IconName; label: string }> = {
  correct: { icon: 'check-circle', label: 'Correct' },
  incorrect: { icon: 'alert', label: 'Try again' },
  passed: { icon: 'check-circle', label: 'Passed' },
  failed: { icon: 'retry', label: 'Not passed yet' },
  loading: { icon: 'gauge', label: 'Working…' },
  // Waiting on a person (a teacher's review), not on the computer: a clock,
  // never a spinner, or it reads as a screen that is stuck loading.
  pending: { icon: 'clock', label: 'Needs review' },
  completed: { icon: 'check-double', label: 'Completed' },
  locked: { icon: 'locked', label: 'Locked' },
  'in-progress': { icon: 'play', label: 'In progress' },
};

@Component({
  selector: 'app-status-indicator',
  imports: [Icon],
  templateUrl: './status-indicator.html',
  styleUrl: './status-indicator.scss',
})
export class StatusIndicator {
  readonly status = input.required<Status>();
  /** Overrides the preset wording; the icon and colour stay consistent. */
  readonly label = input<string | null>(null);
  readonly size = input<'sm' | 'md'>('md');
  /** Icon only, for tight spots like a chapter list. */
  readonly compact = input(false);

  readonly preset = computed(() => PRESETS[this.status()]);
  readonly text = computed(() => this.label() ?? this.preset().label);
  readonly spinning = computed(() => this.status() === 'loading');
}
