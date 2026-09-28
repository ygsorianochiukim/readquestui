import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
} from '@angular/core';
import { Icon } from '../icon/icon';
import { IconName } from '../icon/icons';
import { ProgressBar } from '../progress-bar/progress-bar';

/** How a stop is drawn: gold with stars, pink "you are here", blue, or grey. */
export type LevelStopLook = 'locked' | 'current' | 'available' | 'completed';

/** One stop on the map — a book, or a chapter inside one. */
export interface LevelStop {
  id: number;
  /** The number on the round button. */
  number: number;
  title: string;
  look: LevelStopLook;
  /** A short line under the title, e.g. "1 of 4 chapters". */
  meta?: string;
  /** Shows a progress bar on the name plate when set. */
  percent?: number;
  /** What a screen reader says for the stop. Defaults to the title. */
  label?: string;
}

/** A tapped stop, with its button so the page can zoom in from it. */
export interface LevelStopPick {
  stop: LevelStop;
  element: HTMLElement;
}

interface PlacedStop {
  stop: LevelStop;
  /** Across the map, as a percentage of its width. */
  x: number;
  /** Down the map, in pixels. The first stop sits at the bottom. */
  y: number;
  /** Which side of the stop the road leaves empty, for a tree. */
  scenery: 'left' | 'right';
}

/** Across-positions the stops cycle through, so the road snakes left and right. */
const STOP_X = [50, 74, 54, 26, 46, 72, 50, 28];
/** Vertical distance between two stops: room for the node and its name plate. */
const STOP_STEP = 190;
/** Room above the last stop for the finish flag, and below the first for the grass. */
const MAP_TOP = 150;
const MAP_BOTTOM = 150;
const FINISH = { x: 50, y: MAP_TOP - 105 };

/**
 * A winding level map, Candy Crush style: the first stop at the bottom and a
 * road climbing through the rest to a finish flag.
 *
 * Every stop and name plate has a fixed size and only its position changes,
 * so nothing is ever stretched to fill a gap on a wide screen — the problem
 * that sank the earlier winding map on tablets.
 *
 *   <app-level-map [stops]="stops()" (pick)="open($event.stop)" />
 */
@Component({
  selector: 'app-level-map',
  imports: [Icon, ProgressBar],
  templateUrl: './level-map.html',
  styleUrl: './level-map.scss',
})
export class LevelMap {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private injector = inject(Injector);

  readonly stops = input.required<LevelStop[]>();
  readonly finishIcon = input<IconName>('trophy');
  /** Scroll the current stop into view the first time the stops arrive. */
  readonly autoScroll = input(true);

  readonly pick = output<LevelStopPick>();

  readonly finish = FINISH;

  readonly placed = computed<PlacedStop[]>(() => {
    const stops = this.stops();

    return stops.map((stop, index) => {
      const x = STOP_X[index % STOP_X.length];
      return {
        stop,
        x,
        y: MAP_TOP + (stops.length - 1 - index) * STOP_STEP,
        scenery: x > 50 ? 'left' : x < 50 ? 'right' : index % 4 === 0 ? 'left' : 'right',
      };
    });
  });

  readonly height = computed(
    () => MAP_TOP + Math.max(this.stops().length - 1, 0) * STOP_STEP + MAP_BOTTOM,
  );

  /** The whole road, from the first stop up to the finish flag. */
  readonly road = computed(() => pathThrough([...this.placed(), FINISH]));

  /**
   * The stretch already travelled, in gold: up to the current stop, or all the
   * way to the flag once every stop is finished.
   */
  readonly travelled = computed(() => {
    const placed = this.placed();
    const current = placed.findIndex((p) => p.stop.look === 'current');

    if (current >= 0) {
      return pathThrough(placed.slice(0, current + 1));
    }

    return placed.length && placed.every((p) => p.stop.look === 'completed')
      ? pathThrough([...placed, FINISH])
      : '';
  });

  constructor() {
    let scrolled = false;

    effect(() => {
      const current = this.stops().find((stop) => stop.look === 'current');

      if (scrolled || !this.stops().length) {
        return;
      }

      scrolled = true;
      if (this.autoScroll() && current) {
        afterNextRender(() => this.scrollTo(current.id, 'smooth'), { injector: this.injector });
      }
    });
  }

  /** Scroll a stop to the middle of the screen, and return its button. */
  scrollTo(id: number, behavior: ScrollBehavior): HTMLElement | null {
    const button = this.host.nativeElement.querySelector<HTMLElement>(`[data-stop="${id}"]`);
    const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    button?.scrollIntoView({ block: 'center', behavior: reduced ? 'instant' : behavior });
    return button;
  }

  onPick(stop: LevelStop, event: Event): void {
    this.pick.emit({ stop, element: event.currentTarget as HTMLElement });
  }
}

/**
 * A road through the stops. It leaves each stop straight up and swings into
 * the next from the side, so it never runs under a name plate. x is in
 * percent and y in pixels; the SVG stretches only across.
 */
function pathThrough(points: { x: number; y: number }[]): string {
  if (points.length === 0) {
    return '';
  }

  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1];
    const to = points[i];
    const rise = from.y - to.y;
    d +=
      ` C ${from.x} ${from.y - rise * 0.6},` +
      ` ${to.x + (from.x - to.x) * 0.85} ${to.y},` +
      ` ${to.x} ${to.y}`;
  }

  return d;
}
