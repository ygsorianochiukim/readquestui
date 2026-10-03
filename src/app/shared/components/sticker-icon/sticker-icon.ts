import { Component, computed, input } from '@angular/core';
import { Icon } from '../icon/icon';
import { IconName } from '../icon/icons';

/** The bright colours a sticker can come in. */
export type StickerColor =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'teal'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'grey';

/**
 * Each idea keeps one colour everywhere, so a child learns that orange is
 * home and gold is a trophy before they can read the label under it.
 */
const COLOR_FOR: Partial<Record<IconName, StickerColor>> = {
  home: 'orange',
  map: 'green',
  'map-pin': 'pink',
  trophy: 'yellow',
  crown: 'yellow',
  star: 'yellow',
  sparkles: 'yellow',
  badges: 'pink',
  dashboard: 'purple',
  students: 'teal',
  upload: 'orange',
  log: 'purple',
  profile: 'green',
  bell: 'yellow',
  celebrate: 'pink',
  mic: 'pink',
  books: 'blue',
  book: 'blue',
  'book-marked': 'blue',
  story: 'blue',
  scroll: 'blue',
  back: 'blue',
  forward: 'blue',
  listen: 'purple',
  music: 'purple',
  speech: 'purple',
  game: 'purple',
  shapes: 'purple',
  quiz: 'teal',
  gauge: 'teal',
  feather: 'teal',
  buddy: 'teal',
  play: 'green',
  check: 'green',
  'check-circle': 'green',
  'check-double': 'green',
  verified: 'green',
  target: 'red',
  flag: 'red',
  'flag-finish': 'red',
  layers: 'orange',
  logout: 'red',
  stop: 'red',
  wave: 'orange',
  footprints: 'orange',
  milestone: 'orange',
  locked: 'grey',
};

/**
 * An icon on a glossy, raised tile of colour — the way a game draws its
 * buttons, and much easier for a young child to spot and tell apart than a
 * thin grey outline.
 *
 *   <app-sticker-icon name="trophy" />             gold, from the icon
 *   <app-sticker-icon name="book" color="pink" />  any colour on request
 */
@Component({
  selector: 'app-sticker-icon',
  imports: [Icon],
  template: `<app-icon [name]="name()" [size]="size()" [strokeWidth]="2.5" />`,
  styleUrl: './sticker-icon.scss',
  host: {
    '[class]': "'sticker sticker--' + tone() + ' sticker--' + size()",
    'aria-hidden': 'true',
  },
})
export class StickerIcon {
  readonly name = input.required<IconName | string>();
  /** The tile: sm 28px · md 40px · lg 52px · xl 68px. The icon inside scales with it. */
  readonly size = input<'sm' | 'md' | 'lg' | 'xl'>('md');
  /** Overrides the icon's own colour. */
  readonly color = input<StickerColor | null>(null);

  readonly tone = computed<StickerColor>(
    () => this.color() ?? COLOR_FOR[this.name() as IconName] ?? 'blue',
  );
}
