import { Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';

/** A pupil's presence: using the app now, came in today, or not today. */
export type PresenceState = 'online' | 'present' | 'away';

export function presenceOf(person: { is_online?: boolean; is_present_today?: boolean }): PresenceState {
  if (person.is_online) {
    return 'online';
  }
  return person.is_present_today ? 'present' : 'away';
}

/**
 * The "Active now / Present today / Away" tag beside a pupil's name. Active now
 * means the student app has been used in the last couple of minutes.
 */
@Component({
  selector: 'app-presence',
  imports: [DatePipe],
  template: `
    <span
      class="presence presence--{{ state() }}"
      [attr.title]="lastSeen() ? 'Last seen ' + (lastSeen() | date: 'MMM d, h:mm a') : 'Not seen yet'">
      <span class="presence__dot" aria-hidden="true"></span>
      {{ label() }}
    </span>
  `,
  styles: `
    .presence {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 700;
      white-space: nowrap;
    }

    .presence__dot {
      position: relative;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
    }

    .presence--online {
      background: #e6f8ee;
      color: #17803f;
    }

    /* Only "active now" pulses: something is happening right now. */
    .presence--online .presence__dot::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: currentColor;
      animation: pulse 1.8s ease-out infinite;
    }

    .presence--present {
      background: #e9f1fe;
      color: #3a6ad0;
    }

    .presence--away {
      background: #f1f3f8;
      color: #8a90a6;
    }

    @keyframes pulse {
      from { transform: scale(1); opacity: 0.7; }
      to { transform: scale(2.6); opacity: 0; }
    }

    @media (prefers-reduced-motion: reduce) {
      .presence--online .presence__dot::after { animation: none; }
    }
  `,
})
export class Presence {
  readonly online = input(false);
  readonly presentToday = input(false);
  readonly lastSeen = input<string | null | undefined>(null);

  readonly state = computed<PresenceState>(() =>
    presenceOf({ is_online: this.online(), is_present_today: this.presentToday() }),
  );

  readonly label = computed(() =>
    ({ online: 'Active now', present: 'Present today', away: 'Away' })[this.state()],
  );
}
