import { addSegment, averages, emptyTally, parseSegment } from './live-scores';

/** Azure's detailed JSON for one segment. */
function segmentJson(
  scores: Record<string, number>,
  words: { word: string; accuracy: number; error?: string; phonemes?: number[] }[],
): string {
  return JSON.stringify({
    NBest: [
      {
        PronunciationAssessment: scores,
        Words: words.map((word) => ({
          Word: word.word,
          PronunciationAssessment: { AccuracyScore: word.accuracy, ErrorType: word.error ?? 'None' },
          Phonemes: (word.phonemes ?? []).map((score) => ({
            Phoneme: 'x',
            PronunciationAssessment: { AccuracyScore: score },
          })),
        })),
      },
    ],
  });
}

describe('parseSegment', () => {
  it('reads the segment scores, the words and their sounds', () => {
    const segment = parseSegment(
      segmentJson(
        { AccuracyScore: 90, FluencyScore: 80, ProsodyScore: 70, CompletenessScore: 100 },
        [
          { word: 'the', accuracy: 95, phonemes: [90, 100] },
          { word: 'fox', accuracy: 40, error: 'Mispronunciation' },
          { word: 'dog', accuracy: 0, error: 'Omission', phonemes: [0] },
        ],
      ),
    )!;

    expect(segment.accuracy).toBe(90);
    expect(segment.fluency).toBe(80);
    expect(segment.prosody).toBe(70);
    expect(segment.words.map((word) => word.errorType)).toEqual([
      'None',
      'Mispronunciation',
      'Omission',
    ]);
    // "fox" has no sounds, so its word accuracy stands in; "dog" was never said.
    expect(segment.phonemeScores).toEqual([90, 100, 40]);
  });

  it('shrugs off a segment with nothing in it', () => {
    expect(parseSegment(null)).toBeNull();
    expect(parseSegment('not json')).toBeNull();
    expect(parseSegment('{"NBest":[]}')).toBeNull();
  });
});

describe('running averages', () => {
  it('weights segments by the page words they covered and pools the sounds', () => {
    const long = parseSegment(
      segmentJson({ AccuracyScore: 90, FluencyScore: 90 }, [
        { word: 'a', accuracy: 90, phonemes: [80] },
        { word: 'b', accuracy: 90, phonemes: [80] },
        { word: 'c', accuracy: 90, phonemes: [80] },
      ]),
    )!;
    const short = parseSegment(
      segmentJson({ AccuracyScore: 50, FluencyScore: 50, ProsodyScore: 60 }, [
        { word: 'd', accuracy: 50, phonemes: [40] },
      ]),
    )!;

    const scores = averages(addSegment(addSegment(emptyTally(), long), short));

    expect(scores.accuracy).toBe(80); // (90*3 + 50) / 4
    expect(scores.fluency).toBe(80);
    // Only one segment carried intonation.
    expect(scores.prosody).toBe(60);
    expect(scores.diction).toBe(70); // (80*3 + 40) / 4
  });

  it('is empty before anything is heard', () => {
    expect(averages(emptyTally())).toEqual({
      accuracy: null,
      fluency: null,
      prosody: null,
      diction: null,
    });
  });
});
