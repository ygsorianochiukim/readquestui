import { WordErrorType } from '../../models';

export type WordState = 'pending' | 'current' | 'correct' | 'incorrect' | 'omitted';

/** One word of the passage, as the child sees it and as we score it. */
export interface LiveWord {
  index: number;
  /** Exactly as it appears on the page, punctuation and capitals intact. */
  text: string;
  /** Lower-cased and stripped, for matching against what Azure heard. */
  normalized: string;
  state: WordState;
  accuracy: number | null;
}

/** A word Azure reported in one recognised segment. */
export interface RecognizedWord {
  word: string;
  accuracyScore: number | null;
  errorType: WordErrorType;
}

/**
 * How far ahead of the cursor we will look for a word the child just said.
 *
 * Wide enough to skip over a line the child jumped, narrow enough that a
 * repeated word ("the ... the") does not teleport the cursor to the far end of
 * the page and strand everything in between as "omitted".
 */
const LOOKAHEAD = 12;

/** Strip punctuation and case so "Fox!" and "fox" are the same word. */
export function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
}

/**
 * Split a passage into the words the reader will colour.
 *
 * Whitespace-separated so the page keeps its own punctuation and spacing;
 * anything with no letters or digits in it (a lone dash, a page number
 * artefact) is kept visible but can never be scored.
 */
export function tokenize(text: string): LiveWord[] {
  const pieces = text.split(/\s+/).filter((piece) => piece.length > 0);

  return pieces.map((piece, index) => ({
    index,
    text: piece,
    normalized: normalizeWord(piece),
    state: 'pending' as WordState,
    accuracy: null,
  }));
}

export interface AlignmentResult {
  words: LiveWord[];
  /** Where the next segment should start looking. */
  cursor: number;
}

/**
 * Fold one recognised segment into the passage.
 *
 * Continuous recognition hands back a segment at a time — a phrase, a
 * sentence — and each segment only knows about its own words. This walks the
 * passage forward as those words arrive: a word that matches is marked by how
 * well it was said, words stepped over on the way are marked omitted, and
 * anything the child said that is not on the page is ignored rather than
 * dragging the cursor somewhere wrong.
 *
 * Pure on purpose: everything about the live reader that can be got wrong is
 * in here, and none of it needs a microphone to test.
 */
export function alignSegment(
  words: LiveWord[],
  cursor: number,
  recognized: RecognizedWord[],
): AlignmentResult {
  const next = words.map((word) => ({ ...word }));
  let position = Math.max(0, Math.min(cursor, next.length));

  for (const heard of recognized) {
    // An insertion is a word that is not on the page at all. It says nothing
    // about where we are in the passage, so it must not move the cursor.
    if (heard.errorType === 'Insertion') {
      continue;
    }

    const target = normalizeWord(heard.word);
    if (target === '') {
      continue;
    }

    const found = findAhead(next, position, target);

    if (found === -1) {
      // Azure heard a page word we have already passed, or one it placed
      // somewhere we cannot see. Leave the passage alone.
      continue;
    }

    // Everything between here and the match went unread.
    for (let i = position; i < found; i++) {
      if (next[i].state === 'pending' || next[i].state === 'current') {
        next[i].state = 'omitted';
      }
    }

    next[found].accuracy = heard.accuracyScore;
    next[found].state = isCorrect(heard) ? 'correct' : 'incorrect';

    position = found + 1;
  }

  // Show the child where they are. Only ever one word carries this.
  for (const word of next) {
    if (word.state === 'current') {
      word.state = 'pending';
    }
  }
  if (position < next.length && next[position].state === 'pending') {
    next[position].state = 'current';
  }

  return { words: next, cursor: position };
}

/**
 * Everything still unread at the end of a reading was skipped, not pending —
 * otherwise a child who stopped halfway sees a page that looks unfinished
 * rather than one that tells them what they missed.
 */
export function settle(words: LiveWord[]): LiveWord[] {
  return words.map((word) =>
    word.state === 'pending' || word.state === 'current'
      ? { ...word, state: 'omitted' as WordState }
      : word,
  );
}

/** The words a child needs to try again, in page order. */
export function missedWords(words: LiveWord[]): LiveWord[] {
  return words.filter((word) => word.state === 'incorrect' || word.state === 'omitted');
}

/** Share of scorable words that were read correctly, 0-100. */
export function liveScore(words: LiveWord[]): number {
  const scorable = words.filter((word) => word.normalized !== '');
  if (scorable.length === 0) {
    return 0;
  }

  const correct = scorable.filter((word) => word.state === 'correct').length;

  return Math.round((correct / scorable.length) * 100);
}

/** The bare minimum of a stored word the page can be repainted from. */
export interface ScoredWord {
  word: string;
  accuracy_score: number | null;
  error_type: WordErrorType;
}

/**
 * Pair each word the server scored with the page word it belongs to.
 *
 * The server's list is in page order but is not the page: insertions are
 * words the child said that are not on it, and Azure's own tokenising can
 * drop a lone dash or split a word differently. So this walks both in step,
 * skipping insertions and matching by the normalised word within a short
 * window, rather than trusting that position N here is position N there.
 * A server word that matches nothing is dropped; a page word nothing matched
 * keeps whatever the live pass gave it.
 *
 * @returns page index → the server word scored for it.
 */
export function alignScoredWords<T extends ScoredWord>(
  words: LiveWord[],
  scored: T[],
): Map<number, T> {
  const pairs = new Map<number, T>();
  let position = 0;

  for (const server of scored) {
    if (server.error_type === 'Insertion') {
      continue;
    }

    const target = normalizeWord(server.word);
    if (target === '') {
      continue;
    }

    const found = findAhead(words, position, target);
    if (found === -1) {
      continue;
    }

    pairs.set(found, server);
    position = found + 1;
  }

  return pairs;
}

/** How a stored word should be painted on the page. */
export function stateFor(scored: ScoredWord): WordState {
  if (scored.error_type === 'Omission') {
    return 'omitted';
  }

  return isCorrect({
    word: scored.word,
    accuracyScore: scored.accuracy_score,
    errorType: scored.error_type,
  })
    ? 'correct'
    : 'incorrect';
}

function isCorrect(heard: RecognizedWord): boolean {
  if (heard.errorType !== 'None') {
    return false;
  }

  // Azure reports ErrorType 'None' with a low accuracy score for a word that
  // was recognisable but badly said. For a child learning to read, that is a
  // word to try again, not a word they got right.
  return heard.accuracyScore === null || heard.accuracyScore >= 60;
}

/** Index of the next occurrence of `target` at or after `from`, or -1. */
function findAhead(words: LiveWord[], from: number, target: string): number {
  const limit = Math.min(words.length, from + LOOKAHEAD);

  for (let i = from; i < limit; i++) {
    if (words[i].normalized === target) {
      return i;
    }
  }

  return -1;
}
