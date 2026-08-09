import { Component, input, output } from '@angular/core';
import { Icon } from '../../../shared/components';
import { Achievement } from '../../../models';

/** A nudge toward the achievement the pupil is closest to unlocking. */
@Component({
  selector: 'app-next-trophy',
  imports: [Icon],
  templateUrl: './next-trophy.html',
  styleUrl: './next-trophy.scss',
})
export class NextTrophy {
  readonly achievement = input.required<Achievement>();

  readonly opened = output<void>();
}
