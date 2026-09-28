import { Injectable, inject, signal } from '@angular/core';
import { Celebrations, EarnedReward } from '../../models';
import { AudioService } from '../audio/audio';

/** One toast waiting its turn, with the milestone headline it belongs under. */
interface QueuedReward {
  reward: EarnedReward;
  milestone: string | null;
}

/**
 * Rewards waiting to be shown to the child.
 *
 * Badges are earned all over the app — passing a read-aloud, finishing a quiz,
 * winning a game — and the API reports them on whichever response happened to
 * trigger them. Rather than every page growing its own reward popup, they are
 * pushed here and one toast in the student shell shows them.
 *
 * The read-aloud score modal is the exception: it already celebrates in place,
 * so it does not push here as well and the child is not congratulated twice.
 */
@Injectable({ providedIn: 'root' })
export class CelebrationService {
  private audio = inject(AudioService);

  /** The reward on screen right now, if any. */
  readonly current = signal<EarnedReward | null>(null);
  readonly milestone = signal<string | null>(null);

  private queue: QueuedReward[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** Hand it whatever came back with a response; nothing happens if it is empty. */
  push(celebrations: Celebrations | null | undefined): void {
    if (!celebrations) {
      return;
    }

    const rewards = [...celebrations.badges, ...celebrations.achievements];
    const milestone = this.describe(celebrations.milestone);

    if (rewards.length === 0 && !milestone) {
      return;
    }

    if (rewards.length === 0) {
      // A milestone with no badge attached still deserves a toast of its own;
      // with nothing queued, advance() would otherwise clear it unseen.
      this.enqueue([
        {
          reward: {
            id: 0,
            name: milestone!,
            description: 'Keep up the great reading!',
            icon: null,
            points: 0,
          },
          milestone: null,
        },
      ]);
      return;
    }

    this.enqueue(rewards.map((reward) => ({ reward, milestone })));
  }

  /**
   * Points earned by an activity that is not a badge or milestone — winning a
   * mini-game, say. Shown in the same toast so every reward looks alike.
   */
  pushPoints(points: number, name: string, description: string | null = null): void {
    if (points <= 0) {
      return;
    }

    this.enqueue([{ reward: { id: 0, name, description, icon: null, points }, milestone: null }]);
  }

  /** The child tapped it away, or the timer ran out. */
  dismiss(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.advance();
  }

  private enqueue(items: QueuedReward[]): void {
    this.queue.push(...items);

    if (!this.current()) {
      this.audio.play('celebrate');
      this.advance();
    }
  }

  private advance(): void {
    const next = this.queue.shift() ?? null;

    this.current.set(next?.reward ?? null);
    this.milestone.set(next?.milestone ?? null);

    if (!next) {
      return;
    }

    // Long enough to read, short enough not to block the next tap.
    this.timer = setTimeout(() => this.dismiss(), 4500);
  }

  private describe(milestone: Celebrations['milestone']): string | null {
    switch (milestone) {
      case 'book_completed':
        return 'You finished the whole book!';
      case 'chapter_completed':
        return 'Chapter complete!';
      case 'page_completed':
        return 'Page complete!';
      default:
        return null;
    }
  }
}
