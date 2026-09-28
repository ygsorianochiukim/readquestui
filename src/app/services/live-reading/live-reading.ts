import { Injectable, inject, signal, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ReadingPace } from '../../models';
import { RecorderService } from '../recorder/recorder';
import { SpeechTokenService } from '../speech-token/speech-token';
import { loadSpeechSdk } from './speech-sdk-loader';
import { LiveScores, ScoreTally, addSegment, averages, emptyTally, parseSegment } from './live-scores';
import {
  LiveWord,
  RecognizedWord,
  alignSegment,
  liveScore,
  missedWords,
  settle,
  tokenize,
} from './word-alignment';

/** Nothing here is the final word — the server scores the whole recording. */
export type LiveState = 'idle' | 'connecting' | 'listening' | 'stopping';

/** Words-per-minute bands, mirroring ReadingPaceService on the API. */
const PACE_BANDS: Record<number, [number, number]> = {
  1: [30, 70],
  2: [55, 95],
  3: [75, 115],
  4: [90, 135],
  5: [100, 150],
  6: [110, 160],
};
const DEFAULT_BAND: [number, number] = [50, 120];

/** Everything about the page that a one-word retry sets aside. */
interface PageStash {
  words: LiveWord[];
  cursor: number;
  /** The word being retried. */
  index: number;
  transcript: string;
  tally: ScoreTally;
}

/**
 * Listens while a child reads and colours the page as they go.
 *
 * The recording still goes to the API afterwards, and that score is the one
 * that counts: it is checked against what the child actually said, which this
 * cannot do on its own. What happens here is feedback — the word lighting up
 * green as they get it right, the one that went wrong turning red so they can
 * try it again — and it has to happen while they are still reading, which is
 * why it talks to Azure straight from the browser.
 */
@Injectable({ providedIn: 'root' })
export class LiveReadingService {
  private recorder = inject(RecorderService);
  private tokens = inject(SpeechTokenService);

  readonly state = signal<LiveState>('idle');
  readonly words = signal<LiveWord[]>([]);
  /** What the child is saying right now, before Azure has settled on it. */
  readonly partial = signal('');
  /** Everything Azure has settled on so far. */
  readonly transcript = signal('');
  readonly wordsPerMinute = signal<number | null>(null);
  readonly pace = signal<ReadingPace | null>(null);
  readonly errorMessage = signal<string | null>(null);

  /**
   * Running averages of Azure's own scores for the segments heard so far —
   * the same dimensions the final score reports, while the child is reading.
   * Null until a segment has carried that score.
   */
  readonly scores = signal<LiveScores>(averages(emptyTally()));
  readonly liveAccuracy = computed(() => this.scores().accuracy);
  readonly liveFluency = computed(() => this.scores().fluency);
  /** Intonation. */
  readonly liveProsody = computed(() => this.scores().prosody);
  /** Diction: how clearly each sound came out (mean phoneme accuracy). */
  readonly liveDiction = computed(() => this.scores().diction);

  /**
   * The same four, ready to render as meters, with the labels a child sees.
   * Only the ones that have a value yet.
   */
  readonly meters = computed(() => {
    const scores = this.scores();

    return [
      { key: 'accuracy', label: 'Saying the words', value: scores.accuracy },
      { key: 'fluency', label: 'Reading smoothly', value: scores.fluency },
      { key: 'prosody', label: 'Reading with feeling', value: scores.prosody },
      { key: 'diction', label: 'Speaking clearly', value: scores.diction },
    ].filter((meter): meter is { key: string; label: string; value: number } => meter.value !== null);
  });

  readonly listening = computed(() => this.state() === 'listening');
  readonly score = computed(() => liveScore(this.words()));
  readonly missed = computed(() => missedWords(this.words()));

  /** Words read correctly so far, for the progress meter. */
  readonly readCount = computed(
    () => this.words().filter((word) => word.state === 'correct').length,
  );

  private recognizer: any = null;
  private pushStream: any = null;
  private cursor = 0;
  private startedAt = 0;
  private band: [number, number] = DEFAULT_BAND;
  private tally: ScoreTally = emptyTally();
  /**
   * Bumped on every start(), so a segment a previous session's recogniser
   * delivers late cannot land in this one's transcript.
   */
  private session = 0;
  /** The page set aside while the child retries a single word. */
  private stash: PageStash | null = null;

  /** Whether live reading can run at all — an old browser has no AudioContext. */
  get isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof AudioContext !== 'undefined'
    );
  }

  /**
   * Lay the passage out without listening to anything, so the reader can show
   * the words before the child presses record.
   */
  prepare(referenceText: string, readingLevel?: string | null): void {
    this.words.set(tokenize(referenceText));
    this.cursor = 0;
    this.partial.set('');
    this.transcript.set('');
    this.wordsPerMinute.set(null);
    this.pace.set(null);
    this.errorMessage.set(null);
    this.tally = emptyTally();
    this.scores.set(averages(this.tally));
    this.band = this.bandFor(readingLevel);
  }

  /**
   * Open the microphone and start scoring.
   *
   * @throws when the microphone is refused or Azure cannot be reached — the
   *         caller falls back to plain recording, which still gets a score.
   */
  async start(referenceText: string, readingLevel?: string | null): Promise<void> {
    if (this.state() !== 'idle') {
      await this.stop();
    }

    this.prepare(referenceText, readingLevel);
    this.state.set('connecting');
    const session = ++this.session;

    try {
      const credentials = await firstValueFrom(this.tokens.get());

      // Loaded on demand from the package's browser build — see
      // speech-sdk-loader for why it cannot simply be imported.
      const sdk = await loadSpeechSdk();
      this.assertStillStarting(session);

      const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(
        credentials.token,
        credentials.region,
      );
      speechConfig.speechRecognitionLanguage = 'en-US';

      this.pushStream = sdk.AudioInputStream.createPushStream(
        sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1),
      );

      const recognizer = new sdk.SpeechRecognizer(
        speechConfig,
        sdk.AudioConfig.fromStreamInput(this.pushStream),
      );

      const assessment = new sdk.PronunciationAssessmentConfig(
        referenceText,
        sdk.PronunciationAssessmentGradingSystem.HundredMark,
        // Phoneme granularity still scores every word, and adds a score per
        // sound — what the live diction meter is built from. The server asks
        // for the same, so the two agree on what "clearly" means.
        sdk.PronunciationAssessmentGranularity.Phoneme,
        // Miscue detection is what turns a skipped word into an omission
        // instead of silently shortening the passage.
        true,
      );
      assessment.enableProsodyAssessment = true;
      assessment.applyTo(recognizer);

      recognizer.recognizing = (_sender: unknown, event: any) => {
        if (session !== this.session) {
          return;
        }
        this.partial.set(event.result?.text ?? '');
      };

      recognizer.recognized = (_sender: unknown, event: any) => {
        if (session !== this.session) {
          return;
        }
        this.partial.set('');
        this.absorb(sdk, event.result);
      };

      recognizer.canceled = (_sender: unknown, event: any) => {
        // An expired token is the one failure worth naming: the next attempt
        // will work, but only if we stop handing the dead one out.
        if (event?.errorCode === sdk.CancellationErrorCode.AuthenticationFailure) {
          this.tokens.clear();
        }
        this.errorMessage.set('Live reading stopped. Your reading is still being scored.');
      };

      this.recognizer = recognizer;

      await new Promise<void>((resolve, reject) => {
        recognizer.startContinuousRecognitionAsync(() => resolve(), reject);
      });
      this.assertStillStarting(session);

      // One microphone, two consumers: the stream for Azure, the same samples
      // kept by the recorder for the WAV the API scores.
      await this.recorder.start({
        onChunk: (pcm) => {
          // The SDK wants a detached ArrayBuffer of exactly this chunk.
          this.pushStream?.write(
            pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength),
          );
        },
      });
      this.assertStillStarting(session);

      this.startedAt = Date.now();
      this.state.set('listening');
    } catch (error) {
      // A newer start() owns the microphone now; leave it alone.
      if (session === this.session) {
        await this.teardown();
        this.state.set('idle');
      }
      throw error;
    }
  }

  /**
   * Opening the microphone takes a few awaits, and the child can give up in
   * the middle of them (leave the page, press "Done"). Carrying on regardless
   * would open a microphone nobody is listening to.
   */
  private assertStillStarting(session: number): void {
    if (session !== this.session || this.state() !== 'connecting') {
      throw new Error('Live reading was stopped before it started.');
    }
  }

  /**
   * Stop listening and hand back the recording.
   *
   * Words still untouched at this point were skipped, and are marked as such —
   * a page left half-pending would tell the child nothing.
   */
  async stop(): Promise<Blob | null> {
    if (this.state() === 'idle') {
      return null;
    }

    this.state.set('stopping');

    const audio = this.recorder.recording ? await this.recorder.stop() : null;

    await this.teardown();

    this.words.update((words) => settle(words));
    this.partial.set('');
    this.state.set('idle');

    return audio;
  }

  /** Give up on the recording entirely — the child pressed cancel. */
  async abandon(): Promise<void> {
    await this.stop();
    this.prepare('');
  }

  /**
   * Start a second go at one word the child got wrong.
   *
   * It runs the same pipeline with that single word as the whole passage, so
   * the scoring is the real thing rather than a guess. The page is put aside
   * first and handed back when the retry finishes — the child should return to
   * exactly the page they left, with one word changed.
   */
  async startWordRetry(index: number): Promise<void> {
    const target = this.words()[index];

    if (!target) {
      throw new Error('That word is not on this page.');
    }

    // Stash before start(), because start() lays out a fresh passage.
    const stash: PageStash = {
      words: this.words(),
      cursor: this.cursor,
      index,
      transcript: this.transcript(),
      tally: this.tally,
    };

    // Held from the start, so a retry abandoned while still connecting can
    // still hand the page back.
    this.stash = stash;

    try {
      await this.start(target.text);
    } catch (error) {
      this.restore(stash);
      this.stash = null;
      throw error;
    }
  }

  /**
   * End the retry, put the page back, and mark that one word by the result.
   *
   * @returns whether the child got it this time.
   */
  async finishWordRetry(): Promise<{ correct: boolean; accuracy: number | null }> {
    const stash = this.stash;
    this.stash = null;

    await this.stop();

    const attempt = this.words()[0];
    const correct = attempt?.state === 'correct';
    const accuracy = attempt?.accuracy ?? null;

    if (stash) {
      this.restore(stash);
      this.words.update((words) =>
        words.map((word) =>
          word.index === stash.index
            ? { ...word, state: correct ? 'correct' : 'incorrect', accuracy }
            : word,
        ),
      );
    }

    return { correct, accuracy };
  }

  /**
   * Give up on a word retry and put the page back exactly as it was — the
   * child pressed "Done" without saying the word.
   */
  async abandonWordRetry(): Promise<void> {
    const stash = this.stash;
    this.stash = null;

    await this.stop();

    if (stash) {
      this.restore(stash);
    }
  }

  /** Hand back the page a retry set aside: its words, transcript and scores. */
  private restore(stash: PageStash): void {
    this.words.set(stash.words);
    this.cursor = stash.cursor;
    this.transcript.set(stash.transcript);
    this.tally = stash.tally;
    this.scores.set(averages(this.tally));
  }

  // ============================================================
  //  Internals
  // ============================================================

  /** Fold one recognised segment into the passage and update the pace. */
  private absorb(sdk: any, result: any): void {
    if (!result || !result.text) {
      return;
    }

    this.transcript.update((text) => `${text} ${result.text}`.trim());

    let recognized: RecognizedWord[] = [];

    // The raw JSON carries everything: each word's verdict, its sounds, and
    // the segment's accuracy, fluency and prosody for the live meters.
    let json: string | null = null;
    try {
      json = result.properties?.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult) ?? null;
    } catch {
      json = null;
    }

    if (!json) {
      // Older SDK builds only expose it through the assessment helper.
      try {
        const detail = sdk.PronunciationAssessmentResult.fromResult(result)?.detailResult;
        json = detail ? JSON.stringify({ NBest: [detail] }) : null;
      } catch {
        json = null;
      }
    }

    const segment = parseSegment(json);

    if (segment) {
      recognized = segment.words;
      this.tally = addSegment(this.tally, segment);
      this.scores.set(averages(this.tally));
    }

    if (recognized.length === 0) {
      // No assessment on this segment — fall back to the plain transcript, so
      // the page still advances even when scoring is missing.
      recognized = result.text
        .split(/\s+/)
        .filter(Boolean)
        .map((word: string) => ({ word, accuracyScore: null, errorType: 'None' as const }));
    }

    const aligned = alignSegment(this.words(), this.cursor, recognized);
    this.words.set(aligned.words);
    this.cursor = aligned.cursor;

    this.updatePace();
  }

  /**
   * Pace from the words actually read so far. Held back until enough of them
   * exist to mean anything — a verdict after three words would flap between
   * "too fast" and "too slow" while the child is still reading.
   */
  private updatePace(): void {
    const read = this.readCount();
    const elapsedMinutes = (Date.now() - this.startedAt) / 60000;

    if (read < 5 || elapsedMinutes <= 0.05) {
      return;
    }

    const wpm = Math.round(read / elapsedMinutes);
    this.wordsPerMinute.set(wpm);

    const [floor, ceiling] = this.band;
    this.pace.set(wpm < floor ? 'too_slow' : wpm > ceiling ? 'too_fast' : 'good');
  }

  private bandFor(readingLevel?: string | null): [number, number] {
    const digits = readingLevel?.match(/\d+/);

    return digits ? (PACE_BANDS[Number(digits[0])] ?? DEFAULT_BAND) : DEFAULT_BAND;
  }

  private async teardown(): Promise<void> {
    const recognizer = this.recognizer;
    this.recognizer = null;

    if (recognizer) {
      await new Promise<void>((resolve) => {
        try {
          recognizer.stopContinuousRecognitionAsync(
            () => {
              recognizer.close();
              resolve();
            },
            () => {
              recognizer.close();
              resolve();
            },
          );
        } catch {
          resolve();
        }
      });
    }

    try {
      this.pushStream?.close();
    } catch {
      /* already closed */
    }
    this.pushStream = null;

    if (this.recorder.recording) {
      await this.recorder.stop();
    }
  }
}
