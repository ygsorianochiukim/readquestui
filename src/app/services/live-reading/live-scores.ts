import { WordErrorType } from '../../models';
import { RecognizedWord } from './word-alignment';

/**
 * What Azure said about one recognised segment, pulled out of the SDK's raw
 * result JSON: the segment-level scores, and each word with its sounds.
 */
export interface SegmentAssessment {
  accuracy: number | null;
  fluency: number | null;
  prosody: number | null;
  completeness: number | null;
  words: RecognizedWord[];
  /** Per-sound accuracy across the words actually said — diction's raw material. */
  phonemeScores: number[];
}

/** The four dimensions shown while the child reads, each 0-100 or null. */
export interface LiveScores {
  accuracy: number | null;
  fluency: number | null;
  prosody: number | null;
  diction: number | null;
}

/**
 * A running total the live meters are averaged from.
 *
 * Segment scores are weighted by how many page words the segment covered, so a
 * one-word "um, the" does not count as much as a whole sentence. Diction pools
 * every sound heard rather than averaging segment averages.
 */
export interface ScoreTally {
  accuracy: WeightedSum;
  fluency: WeightedSum;
  prosody: WeightedSum;
  diction: WeightedSum;
}

interface WeightedSum {
  total: number;
  weight: number;
}

export function emptyTally(): ScoreTally {
  return {
    accuracy: { total: 0, weight: 0 },
    fluency: { total: 0, weight: 0 },
    prosody: { total: 0, weight: 0 },
    diction: { total: 0, weight: 0 },
  };
}

/**
 * Read a segment's pronunciation assessment out of Azure's detailed JSON.
 *
 * The SDK's own PronunciationAssessmentResult only surfaces some of this, and
 * differently between versions; the JSON is the one shape that is stable.
 * Returns null when the segment carries no assessment at all.
 */
export function parseSegment(json: string | null | undefined): SegmentAssessment | null {
  if (!json) {
    return null;
  }

  let data: any;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }

  const best = data?.NBest?.[0];
  if (!best) {
    return null;
  }

  // Word/phoneme granularity puts the scores under PronunciationAssessment;
  // older payloads had them on the NBest item itself.
  const scores = best.PronunciationAssessment ?? best;
  const rawWords: any[] = Array.isArray(best.Words) ? best.Words : [];

  const words: RecognizedWord[] = [];
  const phonemeScores: number[] = [];

  for (const word of rawWords) {
    if (!word?.Word) {
      continue;
    }

    const assessment = word.PronunciationAssessment ?? word;
    const errorType = (assessment.ErrorType ?? 'None') as WordErrorType;
    const accuracy = numberOrNull(assessment.AccuracyScore);

    words.push({ word: word.Word, accuracyScore: accuracy, errorType });

    // An omitted word was never said and an inserted one is not on the page;
    // neither tells us anything about how clearly the child speaks.
    if (errorType === 'Omission' || errorType === 'Insertion') {
      continue;
    }

    const sounds = (Array.isArray(word.Phonemes) ? word.Phonemes : [])
      .map((phoneme: any) =>
        numberOrNull(phoneme?.PronunciationAssessment?.AccuracyScore ?? phoneme?.AccuracyScore),
      )
      .filter((score: number | null): score is number => score !== null);

    if (sounds.length > 0) {
      phonemeScores.push(...sounds);
    } else if (accuracy !== null) {
      phonemeScores.push(accuracy);
    }
  }

  return {
    accuracy: numberOrNull(scores.AccuracyScore),
    fluency: numberOrNull(scores.FluencyScore),
    prosody: numberOrNull(scores.ProsodyScore),
    completeness: numberOrNull(scores.CompletenessScore),
    words,
    phonemeScores,
  };
}

/** Fold one segment into the running tally. Pure: returns a new tally. */
export function addSegment(tally: ScoreTally, segment: SegmentAssessment): ScoreTally {
  // Page words this segment covered; at least one, so a segment Azure scored
  // without a word list still counts for something.
  const weight = Math.max(1, segment.words.filter((word) => word.errorType !== 'Insertion').length);

  return {
    accuracy: add(tally.accuracy, segment.accuracy, weight),
    fluency: add(tally.fluency, segment.fluency, weight),
    prosody: add(tally.prosody, segment.prosody, weight),
    diction: segment.phonemeScores.reduce(
      (sum, score) => ({ total: sum.total + score, weight: sum.weight + 1 }),
      tally.diction,
    ),
  };
}

/** The averages the meters show, rounded for a child to read. */
export function averages(tally: ScoreTally): LiveScores {
  return {
    accuracy: mean(tally.accuracy),
    fluency: mean(tally.fluency),
    prosody: mean(tally.prosody),
    diction: mean(tally.diction),
  };
}

function add(sum: WeightedSum, value: number | null, weight: number): WeightedSum {
  return value === null ? sum : { total: sum.total + value * weight, weight: sum.weight + weight };
}

function mean(sum: WeightedSum): number | null {
  return sum.weight === 0 ? null : Math.round(sum.total / sum.weight);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
