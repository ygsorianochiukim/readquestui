import { Component, inject } from '@angular/core';
import { CelebrationService } from '../../../services/celebration/celebration';
import { Icon } from '../icon/icon';

/**
 * The badge-earned popup. Mounted once in the student shell, so a reward earned
 * on any screen is announced the same way, and pages do not each grow one.
 */
@Component({
  selector: 'app-reward-toast',
  imports: [Icon],
  template: `
    @if (celebrations.current(); as reward) {
      <div class="toast" role="status" (click)="celebrations.dismiss()">
        <!-- Points from play get a star; badges and milestones keep the trophy. -->
        <app-icon class="toast__icon" [name]="reward.id === 0 && reward.points ? 'star' : 'trophy'" size="xl" />

        <div class="toast__body">
          @if (celebrations.milestone(); as milestone) {
            <p class="toast__milestone">{{ milestone }}</p>
          }
          <p class="toast__name">{{ reward.name }}</p>
          @if (reward.description) {
            <p class="toast__note">{{ reward.description }}</p>
          }
        </div>

        @if (reward.points) {
          <span class="toast__points">+{{ reward.points }}</span>
        }
      </div>
    }
  `,
  styleUrl: './reward-toast.scss',
})
export class RewardToast {
  readonly celebrations = inject(CelebrationService);
}
