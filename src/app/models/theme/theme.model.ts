/** The looks a book or chapter can be read in. Keep in step with App\Domain\Theme\Themes. */
export type ThemeKey =
  | 'jungle'
  | 'party'
  | 'halloween'
  | 'ocean'
  | 'space'
  | 'candy'
  | 'winter'
  | 'farm'
  | 'dinosaur'
  | 'fairytale';

export interface ReadingTheme {
  key: ThemeKey;
  name: string;
  /** One line for the teacher's picker. */
  blurb: string;
  /** The world behind every screen, top to bottom. */
  sky: [string, string, string];
  /** Little things that drift past in the background. */
  scenery: string[];
}

export const THEMES: ReadingTheme[] = [
  {
    key: 'jungle',
    name: 'Jungle',
    blurb: 'Palm trees, parrots and monkeys',
    sky: ['#1f6f3a', '#3fa34d', '#9bd46c'],
    scenery: ['🌴', '🐒', '🦜', '🌿', '🍌', '🐍'],
  },
  {
    key: 'party',
    name: 'Party',
    blurb: 'Balloons, confetti and presents',
    sky: ['#e2458c', '#ff8a5b', '#ffd66b'],
    scenery: ['🎈', '🎉', '🎊', '🥳', '🎁', '🎂'],
  },
  {
    key: 'halloween',
    name: 'Halloween',
    blurb: 'Pumpkins, friendly ghosts and bats',
    sky: ['#24123f', '#55287f', '#e9822a'],
    scenery: ['🎃', '👻', '🦇', '🕸️', '🍬', '🌕'],
  },
  {
    key: 'ocean',
    name: 'Under the Sea',
    blurb: 'Fish, whales and bubbles',
    sky: ['#0b3d91', '#1976d2', '#56c8f5'],
    scenery: ['🐠', '🐙', '🐳', '🫧', '🐚', '🦀'],
  },
  {
    key: 'space',
    name: 'Outer Space',
    blurb: 'Rockets, planets and stars',
    sky: ['#0b0f2e', '#2a1b5f', '#5b3fa8'],
    scenery: ['🚀', '🪐', '⭐', '🌙', '👽', '☄️'],
  },
  {
    key: 'candy',
    name: 'Candy Land',
    blurb: 'Lollipops, cupcakes and sweets',
    sky: ['#e0609f', '#ff9fd0', '#bfe9ff'],
    scenery: ['🍭', '🍬', '🧁', '🍩', '🍓', '🍦'],
  },
  {
    key: 'winter',
    name: 'Winter',
    blurb: 'Snowflakes, snowmen and penguins',
    sky: ['#3f7fc4', '#8cc2ee', '#e3f3ff'],
    scenery: ['❄️', '⛄', '🧣', '🐧', '🌨️', '🎿'],
  },
  {
    key: 'farm',
    name: 'Farm',
    blurb: 'Cows, chickens and sunflowers',
    sky: ['#3d93d6', '#8fd0ee', '#86c95a'],
    scenery: ['🐄', '🐔', '🌻', '🚜', '🐷', '🐑'],
  },
  {
    key: 'dinosaur',
    name: 'Dinosaurs',
    blurb: 'Dinos, volcanoes and eggs',
    sky: ['#34502a', '#6f8a36', '#d9b46a'],
    scenery: ['🦕', '🦖', '🌋', '🥚', '🌿', '🦴'],
  },
  {
    key: 'fairytale',
    name: 'Fairy Tale',
    blurb: 'Castles, unicorns and crowns',
    sky: ['#6a4cc9', '#b77fe3', '#ffc9ec'],
    scenery: ['🏰', '🦄', '👑', '✨', '🧚', '🐉'],
  },
];

export function themeFor(key: string | null | undefined): ReadingTheme | null {
  return THEMES.find((theme) => theme.key === key) ?? null;
}
