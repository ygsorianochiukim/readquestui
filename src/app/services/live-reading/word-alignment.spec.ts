import {
  LiveWord,
  RecognizedWord,
  alignScoredWords,
  alignSegment,
  liveScore,
  missedWords,
  normalizeWord,
  settle,
  stateFor,
  tokenize,
} from './word-alignment';

const PAGE = 'The quick brown fox jumps over the lazy dog.';

/** Azure's word list for a segment, all read correctly unless stated. */
function heard(
  text: string,
  overrides: Record<string, Partial<RecognizedWord>> = {},
): RecognizedWord[] {
  return text.split(/\s+/).map((word) => ({
    word,
    accuracyScore: 95,
    errorType: 'None',
    ...(overrides[word] ?? {}),
  }));
}

function statesOf(words: LiveWord[]): string[] {
  return words.map((word) => word.state);
}

describe('tokenize', () => {
  it('keeps the page exactly as written', () => {
    const words = tokenize(PAGE);

    expect(words).toHaveLength(9);
    // The child reads "dog." with its full stop; only the match ignores it.
    expect(words[8].text).toBe('dog.');
    expect(words[8].normalized).toBe('dog');
  });

  it('starts every word waiting to be read', () => {
    expect(new Set(statesOf(tokenize(PAGE)))).toEqual(new Set(['pending']));
  });

  it('survives punctuation that is not a word at all', () => {
    const words = tokenize('Hello — world');

    expect(words).toHaveLength(3);
    // An em dash normalises to nothing, so it can never be scored.
    expect(words[1].normalized).toBe('');
  });
});

describe('normalizeWord', () => {
  it('ignores case and punctuation but keeps apostrophes', () => {
    expect(normalizeWord('Fox!')).toBe('fox');
    expect(normalizeWord("don't")).toBe("don't");
    expect(normalizeWord('“quoted”')).toBe('quoted');
  });
});

describe('alignSegment', () => {
  it('marks words correct as they are read', () => {
    const { words, cursor } = alignSegment(tokenize(PAGE), 0, heard('the quick brown'));

    expect(statesOf(words).slice(0, 3)).toEqual(['correct', 'correct', 'correct']);
    expect(cursor).toBe(3);
    // The next word is highlighted so the child can see where they are.
    expect(words[3].state).toBe('current');
  });

  it('marks a mispronounced word wrong without stopping the reading', () => {
    const { words, cursor } = alignSegment(
      tokenize(PAGE),
      0,
      heard('the quick brown', { quick: { errorType: 'Mispronunciation', accuracyScore: 20 } }),
    );

    expect(statesOf(words).slice(0, 3)).toEqual(['correct', 'incorrect', 'correct']);
    expect(cursor).toBe(3);
  });

  it('treats a recognised-but-poorly-said word as one to try again', () => {
    // Azure calls this ErrorType None with a low accuracy. For a child learning
    // to read that is not a word they got right.
    const { words } = alignSegment(
      tokenize(PAGE),
      0,
      heard('the quick', { quick: { accuracyScore: 31 } }),
    );

    expect(words[1].state).toBe('incorrect');
    expect(words[1].accuracy).toBe(31);
  });

  it('marks words skipped over as omitted', () => {
    const { words, cursor } = alignSegment(tokenize(PAGE), 0, heard('the fox'));

    expect(statesOf(words).slice(0, 4)).toEqual(['correct', 'omitted', 'omitted', 'correct']);
    expect(cursor).toBe(4);
  });

  it('ignores words the child said that are not on the page', () => {
    const words = tokenize(PAGE);

    const { words: after, cursor } = alignSegment(words, 0, [
      { word: 'the', accuracyScore: 95, errorType: 'None' },
      // An insertion says nothing about where we are; it must not move us.
      { word: 'umm', accuracyScore: 40, errorType: 'Insertion' },
      { word: 'quick', accuracyScore: 95, errorType: 'None' },
    ]);

    expect(statesOf(after).slice(0, 2)).toEqual(['correct', 'correct']);
    expect(cursor).toBe(2);
  });

  it('carries on across several segments', () => {
    let state = alignSegment(tokenize(PAGE), 0, heard('the quick brown fox'));
    state = alignSegment(state.words, state.cursor, heard('jumps over the lazy dog'));

    expect(statesOf(state.words)).toEqual(Array(9).fill('correct'));
    expect(state.cursor).toBe(9);
  });

  it('does not jump to a far-off repeat of a word', () => {
    // "the" appears twice. A child at the start saying "the" must match the
    // first one, not teleport the cursor to the seventh word and strand
    // everything in between.
    const { words, cursor } = alignSegment(tokenize(PAGE), 0, heard('the'));

    expect(cursor).toBe(1);
    expect(words[6].state).not.toBe('correct');
  });

  it('leaves the page alone when it hears something it cannot place', () => {
    const before = tokenize(PAGE);
    const { words, cursor } = alignSegment(before, 4, heard('the'));

    // "the" at index 6 is within reach of the cursor, so it does match there.
    expect(cursor).toBe(7);
    expect(words[6].state).toBe('correct');
  });

  it('never leaves more than one word marked as current', () => {
    let state = alignSegment(tokenize(PAGE), 0, heard('the quick'));
    state = alignSegment(state.words, state.cursor, heard('brown'));

    expect(statesOf(state.words).filter((s) => s === 'current')).toHaveLength(1);
  });

  it('copies rather than mutates, so signals actually update', () => {
    const before = tokenize(PAGE);
    const { words } = alignSegment(before, 0, heard('the'));

    expect(before[0].state).toBe('pending');
    expect(words[0].state).toBe('correct');
    expect(words).not.toBe(before);
  });
});

describe('settle', () => {
  it('turns anything still unread into a skipped word', () => {
    const { words } = alignSegment(tokenize(PAGE), 0, heard('the quick brown'));
    const settled = settle(words);

    expect(statesOf(settled).slice(3)).toEqual(Array(6).fill('omitted'));
    // What was already decided stays decided.
    expect(statesOf(settled).slice(0, 3)).toEqual(['correct', 'correct', 'correct']);
  });
});

describe('missedWords', () => {
  it('lists what to practise, in page order', () => {
    const { words } = alignSegment(
      tokenize(PAGE),
      0,
      heard('the brown fox', { brown: { errorType: 'Mispronunciation', accuracyScore: 12 } }),
    );

    expect(missedWords(settle(words)).map((word) => word.text)).toEqual([
      'quick',
      'brown',
      'jumps',
      'over',
      'the',
      'lazy',
      'dog.',
    ]);
  });
});

describe('liveScore', () => {
  it('reports the share of the page read correctly', () => {
    const { words } = alignSegment(tokenize(PAGE), 0, heard('the quick brown fox jumps'));

    // Five of nine.
    expect(liveScore(words)).toBe(56);
  });

  it('is zero before anything is read, and never divides by zero', () => {
    expect(liveScore(tokenize(PAGE))).toBe(0);
    expect(liveScore([])).toBe(0);
    expect(liveScore(tokenize('— —'))).toBe(0);
  });
});

describe('alignScoredWords', () => {
  const scored = (word: string, error_type: RecognizedWord['errorType'] = 'None') => ({
    word,
    accuracy_score: 90,
    error_type,
  });

  it('pairs the server words with the page by word, not by position', () => {
    const page = tokenize('The fox — ran away.');
    // Azure drops the dash and reports a word the child added.
    const pairs = alignScoredWords(page, [
      scored('the'),
      scored('big', 'Insertion'),
      scored('fox'),
      scored('ran'),
      scored('away', 'Omission'),
    ]);

    expect([...pairs.keys()]).toEqual([0, 1, 3, 4]);
    expect(pairs.get(1)?.word).toBe('fox');
    expect(stateFor(pairs.get(4)!)).toBe('omitted');
  });

  it('leaves page words it cannot place alone', () => {
    const page = tokenize('well-known story');
    const pairs = alignScoredWords(page, [scored('well'), scored('known'), scored('story')]);

    expect([...pairs.keys()]).toEqual([1]);
  });
});

describe('tokenize across a page of lines', () => {
  it('marks the first word of each new line, so the page keeps its layout', () => {
    const words = tokenize('Celest brings a wasp!\n\nShe puts the jar down.\nWe all gasp!');

    expect(words.map((word) => word.index)).toEqual(words.map((_, position) => position));
    expect(words.filter((word) => word.newLine).map((word) => word.text)).toEqual(['She', 'We']);
    expect(words[0].newLine).toBe(false);
  });
});
