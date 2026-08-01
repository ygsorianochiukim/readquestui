import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-progress-bar',
  templateUrl: './progress-bar.html',
  styleUrl: './progress-bar.scss',
})
export class ProgressBar {
  readonly percent = input<number>(0);
  readonly showLabel = input<boolean>(true);

  readonly clamped = computed(() => Math.max(0, Math.min(100, Math.round(this.percent()))));
}
