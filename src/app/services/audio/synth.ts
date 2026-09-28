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
};

/** Play a synthesised cue into `out`, at the caller's volume (0–1). */
export function playSynthCue(ctx: AudioContext, out: AudioNode, name: SoundName, volume: number): void {
  const start = ctx.currentTime + 0.01;
  const level = volume * CUE_LEVEL;

  if (name === 'page-turn') {
    swish(ctx, out, start, level);
    return;
  }

  for (const note of CUES[name]) {
    tone(ctx, out, start, note, level);
  }
}

// =============================================================
//  Background music
// =============================================================

/** C major pentatonic across two octaves — no note in it can clash. */
const SCALE = [262, 294, 330, 392, 440, 523, 587, 659, 784, 880];

/** I – vi – IV – V, two bars each, as low pad voicings. */
const CHORDS = [
  [131, 165, 196],
  [110, 131, 165],
  [87, 110, 131],
  [98, 123, 147],
];

const BEAT = 60 / 76; // a slow, unhurried walk
const BEATS_PER_CHORD = 8;
const LOOKAHEAD = 1.2; // seconds of music scheduled ahead of the clock
const TICK_MS = 300;

/**
 * A gentle tune that never repeats exactly: a soft pentatonic melody wandering
 * over a slow pad. It is scheduled a second ahead on the audio clock, so a busy
 * main thread cannot make it stutter.
 */
export class GenerativeMusic {
  private out: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBeat = 0;
  private beat = 0;
  private step = 4;

  constructor(
    private ctx: AudioContext,
    private destination: AudioNode,
  ) {}

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
        const chord = CHORDS[(this.beat / BEATS_PER_CHORD) % CHORDS.length];
        for (const freq of chord) {
          this.pad(out, t, freq, BEAT * BEATS_PER_CHORD);
        }
      }

      // Roughly one beat in four is a rest, so the melody breathes.
      if (Math.random() > 0.25) {
        this.walk();
        this.pluck(out, t, SCALE[this.step], Math.random() > 0.8 ? BEAT * 2 : BEAT);
      }

      this.nextBeat += BEAT;
      this.beat = (this.beat + 1) % (BEATS_PER_CHORD * CHORDS.length);
    }
  }

  /** Move the melody a small step up or down the scale, staying in range. */
  private walk(): void {
    const move = [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)];
    this.step = Math.min(SCALE.length - 1, Math.max(0, this.step + move));
  }

  private pluck(out: AudioNode, t: number, freq: number, length: number): void {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.35, t + 0.03);
    env.gain.exponentialRampToValueAtTime(0.0001, t + length * 1.4);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + length * 1.4 + 0.05);
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
