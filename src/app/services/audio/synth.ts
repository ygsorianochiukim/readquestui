import type { SoundName } from './audio';

/**
 * Synthesised stand-ins for the sound files.
 *
 * Every cue is built from a few oscillators or a burst of filtered noise, so the
 * app has a voice before anyone has recorded a single mp3. They are kept short,
 * soft and round-edged on purpose: a "wrong" sound a six-year-old hears thirty
 * times a session has to be a gentle bloop, not a buzzer.
 */

/** Master level for synthesised cues, on top of the caller's volume. */
const CUE_LEVEL = 0.35;

interface Note {
  freq: number;
  /** Seconds after the cue starts. */
  at: number;
  duration: number;
  type?: OscillatorType;
  /** Frequency to glide to over the note's length. */
  glideTo?: number;
  gain?: number;
}

/** One enveloped oscillator: a quick attack and an exponential fade. */
function tone(ctx: AudioContext, out: AudioNode, start: number, note: Note, volume: number): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  const t0 = start + note.at;
  const t1 = t0 + note.duration;
  const peak = Math.max(0.0001, volume * (note.gain ?? 1));

  osc.type = note.type ?? 'sine';
  osc.frequency.setValueAtTime(note.freq, t0);
  if (note.glideTo) {
    osc.frequency.exponentialRampToValueAtTime(note.glideTo, t1);
  }

  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t1);

  osc.connect(env).connect(out);
  osc.start(t0);
  osc.stop(t1 + 0.02);
}

const noiseBuffers = new WeakMap<AudioContext, AudioBuffer>();

/** Half a second of white noise, made once per context. */
function noise(ctx: AudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);

  if (!buffer) {
    buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    noiseBuffers.set(ctx, buffer);
  }

  return buffer;
}

/** A paper swish: noise through a band-pass that sweeps upward. */
function swish(ctx: AudioContext, out: AudioNode, start: number, volume: number): void {
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const env = ctx.createGain();
  const length = 0.28;

  source.buffer = noise(ctx);
  filter.type = 'bandpass';
  filter.Q.value = 0.9;
  filter.frequency.setValueAtTime(700, start);
  filter.frequency.exponentialRampToValueAtTime(3200, start + length);

  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.8), start + 0.07);
  env.gain.exponentialRampToValueAtTime(0.0001, start + length);

  source.connect(filter).connect(env).connect(out);
  source.start(start);
  source.stop(start + length + 0.02);
}

const CUES: Record<Exclude<SoundName, 'page-turn'>, Note[]> = {
  // Two notes, up a fourth: the "ding-ding" of getting it right.
  correct: [
    { freq: 784, at: 0, duration: 0.18, type: 'triangle' },
    { freq: 1047, at: 0.1, duration: 0.32, type: 'triangle' },
  ],
  // Two low, soft bloops that droop a little — "not quite", never a buzzer.
  incorrect: [
    { freq: 262, glideTo: 220, at: 0, duration: 0.16, gain: 0.9 },
    { freq: 220, glideTo: 175, at: 0.19, duration: 0.24, gain: 0.8 },
  ],
  // A little arpeggio up the major chord, landing on a held top note.
  celebrate: [
    { freq: 523, at: 0, duration: 0.18, type: 'triangle' },
    { freq: 659, at: 0.09, duration: 0.18, type: 'triangle' },
    { freq: 784, at: 0.18, duration: 0.18, type: 'triangle' },
    { freq: 1047, at: 0.27, duration: 0.6, type: 'triangle' },
    { freq: 1319, at: 0.27, duration: 0.6, gain: 0.35 },
  ],
  // A quick run up the pentatonic scale that sparkles off the top.
  'level-up': [
    { freq: 523, at: 0, duration: 0.14, type: 'triangle', gain: 0.8 },
    { freq: 587, at: 0.06, duration: 0.14, type: 'triangle', gain: 0.8 },
    { freq: 659, at: 0.12, duration: 0.14, type: 'triangle', gain: 0.8 },
    { freq: 784, at: 0.18, duration: 0.14, type: 'triangle', gain: 0.8 },
    { freq: 880, at: 0.24, duration: 0.14, type: 'triangle', gain: 0.8 },
    { freq: 1047, at: 0.3, duration: 0.2, type: 'triangle', gain: 0.8 },
    { freq: 1568, at: 0.38, duration: 0.4, gain: 0.4 },
    { freq: 2093, at: 0.46, duration: 0.35, gain: 0.25 },
  ],
  // A soft blip for small confirmations.
  tap: [{ freq: 880, glideTo: 620, at: 0, duration: 0.07, gain: 0.7 }],
  // "Yey!": two bright voices swooping up together, then a cheer on top.
  yey: [
    { freq: 520, glideTo: 880, at: 0, duration: 0.32, type: 'triangle' },
    { freq: 660, glideTo: 1100, at: 0.02, duration: 0.32, type: 'triangle', gain: 0.6 },
    { freq: 880, glideTo: 1320, at: 0.3, duration: 0.45, type: 'triangle', gain: 0.8 },
    { freq: 1100, glideTo: 1650, at: 0.32, duration: 0.45, gain: 0.4 },
  ],
  // "Yip-pee!": a short hop, then a long happy squeal.
  yippee: [
    { freq: 784, glideTo: 1047, at: 0, duration: 0.14, type: 'triangle' },
    { freq: 1047, glideTo: 1568, at: 0.17, duration: 0.5, type: 'triangle' },
    { freq: 1568, at: 0.6, duration: 0.3, gain: 0.35 },
    { freq: 2093, at: 0.68, duration: 0.3, gain: 0.25 },
  ],
  // Sparkles that follow the pop (the pop itself is noise, below).
  'party-popper': [
    { freq: 1568, at: 0.08, duration: 0.15, gain: 0.35 },
    { freq: 2093, at: 0.14, duration: 0.15, gain: 0.3 },
    { freq: 2637, at: 0.2, duration: 0.2, gain: 0.25 },
  ],
  // "Uh-oh": a gentle step down, kind rather than a buzzer.
  'reading-wrong': [
    { freq: 440, glideTo: 415, at: 0, duration: 0.2, type: 'triangle', gain: 0.8 },
    { freq: 349, glideTo: 311, at: 0.24, duration: 0.34, type: 'triangle', gain: 0.8 },
  ],
  // "Wah-wah-wah": three soft, sagging notes — not this time.
  'not-passed': [
    { freq: 392, glideTo: 370, at: 0, duration: 0.26, type: 'triangle', gain: 0.75 },
    { freq: 370, glideTo: 349, at: 0.3, duration: 0.26, type: 'triangle', gain: 0.75 },
    { freq: 349, glideTo: 294, at: 0.6, duration: 0.6, type: 'triangle', gain: 0.75 },
  ],
};

/** A confetti cannon's pop: a short, bright burst of noise. */
function pop(ctx: AudioContext, out: AudioNode, start: number, volume: number): void {
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const env = ctx.createGain();
  const length = 0.16;

  source.buffer = noise(ctx);
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(1800, start);

  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 1.4), start + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, start + length);

  source.connect(filter).connect(env).connect(out);
  source.start(start);
  source.stop(start + length + 0.02);
}

/** Play a synthesised cue into `out`, at the caller's volume (0–1). */
export function playSynthCue(ctx: AudioContext, out: AudioNode, name: SoundName, volume: number): void {
  const start = ctx.currentTime + 0.01;
  const level = volume * CUE_LEVEL;

  if (name === 'page-turn') {
    swish(ctx, out, start, level);
    return;
  }

  if (name === 'party-popper') {
    pop(ctx, out, start, level);
  }

  for (const note of CUES[name]) {
    tone(ctx, out, start, note, level);
  }
}

// =============================================================
//  Background music
// =============================================================

/** A MIDI note number as a frequency. */
const hz = (note: number): number => 440 * 2 ** ((note - 69) / 12);

/** The key, pace and voice the background tune is played in. */
export interface MusicMood {
  /** Ten notes across two octaves, all from one pentatonic scale — none can clash. */
  scale: number[];
  /** Four chords, two bars each, as low pad voicings. */
  chords: number[][];
  bpm: number;
  lead: OscillatorType;
  /** How long a melody note rings, as a multiple of its length. Short sounds like a marimba. */
  ring: number;
}

function mood(scale: number[], chords: number[][], bpm: number, lead: OscillatorType, ring = 1.4): MusicMood {
  return { scale: scale.map(hz), chords: chords.map((chord) => chord.map(hz)), bpm, lead, ring };
}

const C_MAJOR = [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]]; // I – vi – IV – V
const F_MAJOR = [[41, 45, 48], [38, 41, 45], [46, 50, 53], [48, 52, 55]];
const D_MAJOR = [[38, 42, 45], [35, 38, 42], [43, 47, 50], [45, 49, 52]];

const C_PENTA = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81];
const F_PENTA = [65, 67, 69, 72, 74, 77, 79, 81, 84, 86];
const D_PENTA = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83];

/** The default tune: C major, a slow unhurried walk. */
export const DEFAULT_MOOD = mood(C_PENTA, C_MAJOR, 76, 'sine');

/**
 * One tune per reading theme. Keyed by theme name so this file need not know
 * the theme list; a theme without a mood plays the default.
 */
export const MOODS: Record<string, MusicMood> = {
  jungle: mood([67, 69, 71, 74, 76, 79, 81, 83, 86, 88], [[43, 47, 50], [40, 43, 47], [48, 52, 55], [50, 54, 57]], 96, 'triangle', 0.6),
  party: mood(F_PENTA, F_MAJOR, 118, 'triangle', 0.7),
  halloween: mood([57, 60, 62, 64, 67, 69, 72, 74, 76, 79], [[45, 48, 52], [41, 45, 48], [38, 41, 45], [40, 44, 47]], 70, 'triangle', 1.6),
  ocean: mood(D_PENTA, D_MAJOR, 58, 'sine', 2),
  space: mood([64, 66, 68, 71, 73, 76, 78, 80, 83, 85], [[40, 44, 47], [37, 40, 44], [45, 49, 52], [47, 51, 54]], 54, 'sine', 2.4),
  candy: mood(C_PENTA.map((note) => note + 12), C_MAJOR, 108, 'sine', 0.8),
  winter: mood([70, 72, 74, 77, 79, 82, 84, 86, 89, 91], [[46, 50, 53], [43, 46, 50], [39, 43, 46], [41, 45, 48]], 66, 'sine', 2),
  farm: mood(F_PENTA, F_MAJOR, 100, 'triangle', 0.9),
  dinosaur: mood([50, 53, 55, 57, 60, 62, 65, 67, 69, 72], [[38, 41, 45], [34, 38, 41], [41, 45, 48], [36, 40, 43]], 80, 'triangle', 1.2),
  fairytale: mood(D_PENTA, D_MAJOR, 72, 'triangle', 1.6),
};

const BEATS_PER_CHORD = 8;
const LOOKAHEAD = 1.2; // seconds of music scheduled ahead of the clock
const TICK_MS = 300;

/**
 * A gentle tune that never repeats exactly: a soft pentatonic melody wandering
 * over a slow pad. It is scheduled a second ahead on the audio clock, so a busy
 * main thread cannot make it stutter.
 *
 * Its mood can change while it plays. The new one takes over at the next chord,
 * so moving from one book to another changes the tune without a gap.
 */
export class GenerativeMusic {
  private out: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBeat = 0;
  private beat = 0;
  private step = 4;
  private mood: MusicMood = DEFAULT_MOOD;
  private nextMood: MusicMood | null = null;

  constructor(
    private ctx: AudioContext,
    private destination: AudioNode,
  ) {}

  /** Play in this mood from the next chord on (straight away when not playing). */
  setMood(mood: MusicMood): void {
    if (this.timer) {
      this.nextMood = mood === this.mood ? null : mood;
    } else {
      this.mood = mood;
      this.nextMood = null;
    }
  }

  get playing(): boolean {
    return this.timer !== null;
  }

  start(volume: number): void {
    if (this.timer) {
      return;
    }

    const now = this.ctx.currentTime;
    this.out = this.ctx.createGain();
    this.out.gain.setValueAtTime(0.0001, now);
    this.out.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 1.5);
    this.out.connect(this.destination);

    this.nextBeat = now + 0.1;
    this.beat = 0;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), TICK_MS);
  }

  /** Fade out rather than cut, so stopping never clicks. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    const out = this.out;
    this.out = null;

    if (out) {
      const now = this.ctx.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), now);
      out.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      setTimeout(() => out.disconnect(), 800);
    }
  }

  private schedule(): void {
    const out = this.out;
    if (!out) {
      return;
    }

    // After a long suspend the clock may have raced ahead; skip, do not catch up.
    if (this.nextBeat < this.ctx.currentTime) {
      this.nextBeat = this.ctx.currentTime + 0.05;
    }

    while (this.nextBeat < this.ctx.currentTime + LOOKAHEAD) {
      const t = this.nextBeat;

      if (this.beat % BEATS_PER_CHORD === 0) {
        // A new mood starts on a chord, from the top of its progression.
        if (this.nextMood) {
          this.mood = this.nextMood;
          this.nextMood = null;
          this.beat = 0;
        }

        const chords = this.mood.chords;
        const chord = chords[(this.beat / BEATS_PER_CHORD) % chords.length];
        for (const freq of chord) {
          this.pad(out, t, freq, this.beatLength() * BEATS_PER_CHORD);
        }
      }

      // Roughly one beat in four is a rest, so the melody breathes.
      if (Math.random() > 0.25) {
        this.walk();
        const beat = this.beatLength();
        this.pluck(out, t, this.mood.scale[this.step], Math.random() > 0.8 ? beat * 2 : beat);
      }

      this.nextBeat += this.beatLength();
      this.beat = (this.beat + 1) % (BEATS_PER_CHORD * this.mood.chords.length);
    }
  }

  private beatLength(): number {
    return 60 / this.mood.bpm;
  }

  /** Move the melody a small step up or down the scale, staying in range. */
  private walk(): void {
    const move = [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)];
    this.step = Math.min(this.mood.scale.length - 1, Math.max(0, this.step + move));
  }

  private pluck(out: AudioNode, t: number, freq: number, length: number): void {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    const ring = length * this.mood.ring;
    osc.type = this.mood.lead;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0.0001, t);
    // A triangle is brighter than a sine at the same level; keep them even.
    env.gain.exponentialRampToValueAtTime(this.mood.lead === 'sine' ? 0.35 : 0.22, t + 0.03);
    env.gain.exponentialRampToValueAtTime(0.0001, t + ring);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + ring + 0.05);
  }

  private pad(out: AudioNode, t: number, freq: number, length: number): void {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.12, t + 1.2);
    env.gain.setValueAtTime(0.12, t + length - 1);
    env.gain.linearRampToValueAtTime(0.0001, t + length + 0.4);
    osc.connect(filter).connect(env).connect(out);
    osc.start(t);
    osc.stop(t + length + 0.5);
  }
}
