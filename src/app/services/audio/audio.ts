import { Injectable, signal } from '@angular/core';
import { DEFAULT_MOOD, GenerativeMusic, MOODS, playSynthCue } from './synth';

export type SoundName =
  | 'correct'
  | 'incorrect'
  | 'page-turn'
  | 'celebrate'
  | 'level-up'
  | 'tap'
  | 'yey'
  | 'yippee'
  | 'party-popper'
  | 'reading-wrong'
  | 'not-passed';

/** Where each cue lives. Files are served from the app's public/ folder. */
const SOUNDS: Record<SoundName, string> = {
  correct: 'audio/correct.mp3',
  incorrect: 'audio/incorrect.mp3',
  'page-turn': 'audio/page-turn.mp3',
  celebrate: 'audio/celebrate.mp3',
  'level-up': 'audio/level-up.mp3',
  tap: 'audio/tap.mp3',
  // Kids cheering "yey!": a chapter activity finished.
  yey: 'audio/yey.mp3',
  // "Yippee!": a game won or a quiz passed.
  yippee: 'audio/yippee.mp3',
  // The pop that goes with the confetti cannons at the sides of the screen.
  'party-popper': 'audio/party-popper.mp3',
  // A reading that fell short of the pass mark.
  'reading-wrong': 'audio/reading-wrong.mp3',
  // A quiz or game not passed.
  'not-passed': 'audio/not-passed.mp3',
};

const MUSIC_TRACK = 'audio/background.mp3';
const MUSIC_VOLUME = 0.12;
const MUTE_KEY = 'readquest.sound.muted';
const MUSIC_KEY = 'readquest.music.enabled';

/** Whether a cue is played from its file or synthesised. Unknown until tried. */
type Source = 'file' | 'synth';

/**
 * Sound effects and background music.
 *
 * Two things matter more than the sounds themselves. The first is that a
 * missing file is never silence and never an error: when a cue's mp3 is not
 * there, a small synthesised version plays instead (see synth.ts), so the app
 * has a voice before anyone has recorded a single cue. The second is the mute
 * switch — a classroom of thirty tablets all playing the same loop is the
 * fastest way to get sound turned off for good, so the preference is remembered
 * per device and honoured everywhere, including by the music.
 */
@Injectable({ providedIn: 'root' })
export class AudioService {
  readonly muted = signal(this.read(MUTE_KEY, false));
  /** On unless the child (or teacher) switched it off on this device. */
  readonly musicEnabled = signal(this.read(MUSIC_KEY, true));

  private cache = new Map<SoundName, HTMLAudioElement>();
  /** Remembered per cue, so a missing file is only asked for once. */
  private sources = new Map<SoundName, Source>();
  private music: HTMLAudioElement | null = null;
  private musicSource: Source | null = null;
  private generative: GenerativeMusic | null = null;
  /** The reading theme the generated tune is played in. */
  private mood: string | null = null;

  /** A reading screen asked for music (and has not asked it to stop). */
  private musicWanted = false;
  /** The microphone is open; music waits until it closes. */
  private ducked = false;

  private context: AudioContext | null = null;
  private master: GainNode | null = null;

  constructor() {
    this.listenForFirstGesture();
  }

  /** Play a one-shot cue. Silent only when muted. */
  play(name: SoundName, volume = 0.6): void {
    if (this.muted()) {
      return;
    }

    if (this.sources.get(name) === 'synth') {
      this.synthesise(name, volume);
      return;
    }

    try {
      const element = this.element(name);
      element.volume = volume;
      element.currentTime = 0;
      void element.play().then(
        () => this.sources.set(name, 'file'),
        (error: unknown) => {
          // Browsers reject playback until the child has interacted with the
          // page. That is expected on the first load, not a missing file.
          if (!this.blockedByBrowser(error)) {
            this.sources.set(name, 'synth');
            this.synthesise(name, volume);
          }
        },
      );
    } catch {
      this.sources.set(name, 'synth');
      this.synthesise(name, volume);
    }
  }

  /** Correct/incorrect in one call, so callers do not branch on it themselves. */
  playResult(correct: boolean): void {
    this.play(correct ? 'correct' : 'incorrect', correct ? 0.6 : 0.4);
  }

  toggleMute(): void {
    const next = !this.muted();
    this.muted.set(next);
    this.write(MUTE_KEY, next);

    if (next) {
      this.silenceMusic();
    } else {
      this.resumeMusic();
    }
  }

  toggleMusic(): void {
    const next = !this.musicEnabled();
    this.musicEnabled.set(next);
    this.write(MUSIC_KEY, next);

    if (next && !this.muted()) {
      this.startMusic();
    } else {
      this.silenceMusic();
    }
  }

  /**
   * Start the background music. The student shell calls this once, so the
   * tune plays on, unbroken, from screen to screen. Respects both switches.
   */
  startMusic(): void {
    this.musicWanted = true;
    this.resumeMusic();
  }

  /** Music must not follow a child out of the student app (logging out, say). */
  stopMusic(): void {
    this.musicWanted = false;
    this.silenceMusic();
  }

  /**
   * Play the generated tune in a reading theme's mood. It changes key at the
   * next chord rather than stopping, so the music stays continuous.
   */
  setMood(theme: string | null): void {
    this.mood = theme;
    this.generative?.setMood(this.moodFor(theme));
  }

  /**
   * Pause the music while the microphone is open.
   *
   * 12% is quiet in the room but not to a microphone a few centimetres from a
   * tablet speaker, and a tune under the recording muddies the score.
   */
  duckForRecording(): void {
    this.ducked = true;
    this.silenceMusic();
  }

  /** Bring the music back once recording ends, if it was playing before. */
  restoreAfterRecording(): void {
    if (!this.ducked) {
      return;
    }

    this.ducked = false;
    this.resumeMusic();
  }

  private resumeMusic(): void {
    if (this.muted() || !this.musicEnabled() || !this.musicWanted || this.ducked) {
      return;
    }

    if (this.musicSource === 'synth') {
      this.startGenerative();
      return;
    }

    try {
      this.music ??= this.buildMusic();
      // Quiet enough to sit under a child reading aloud without being picked
      // up by the microphone.
      this.music.volume = MUSIC_VOLUME;
      void this.music.play().then(
        () => (this.musicSource = 'file'),
        (error: unknown) => {
          if (!this.blockedByBrowser(error)) {
            this.musicSource = 'synth';
            this.resumeMusic();
          }
        },
      );
    } catch {
      this.musicSource = 'synth';
      this.startGenerative();
    }
  }

  /** Stop whatever is playing without forgetting that music was wanted. */
  private silenceMusic(): void {
    this.music?.pause();
    this.generative?.stop();
  }

  private startGenerative(): void {
    const context = this.audioContext();
    if (!context || !this.master) {
      return;
    }

    if (!this.generative) {
      this.generative = new GenerativeMusic(context, this.master);
      this.generative.setMood(this.moodFor(this.mood));
    }
    this.generative.start(MUSIC_VOLUME);
  }

  private moodFor(theme: string | null) {
    return (theme && MOODS[theme]) || DEFAULT_MOOD;
  }

  private synthesise(name: SoundName, volume: number): void {
    const context = this.audioContext();
    if (!context || !this.master) {
      return;
    }

    try {
      playSynthCue(context, this.master, name, volume);
    } catch {
      /* no sound is better than a broken screen */
    }
  }

  /**
   * The Web Audio context, made on first use and woken if the browser put it
   * to sleep. Null where Web Audio does not exist.
   */
  private audioContext(): AudioContext | null {
    if (!this.context) {
      const Context =
        typeof window === 'undefined'
          ? undefined
          : (window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext);

      if (!Context) {
        return null;
      }

      try {
        this.context = new Context();
        this.master = this.context.createGain();
        this.master.connect(this.context.destination);
      } catch {
        return null;
      }
    }

    if (this.context.state === 'suspended') {
      void this.context.resume().catch(() => undefined);
    }

    return this.context;
  }

  /**
   * Browsers keep audio asleep until the child touches the page. The first tap
   * or key press anywhere wakes the context, so the first cue is not lost.
   */
  private listenForFirstGesture(): void {
    if (typeof document === 'undefined') {
      return;
    }

    const wake = () => {
      // Music asked for before the first tap was refused by the browser;
      // this tap is the permission it was waiting for.
      this.resumeMusic();
      const context = this.audioContext();
      if (!context || context.state === 'running') {
        document.removeEventListener('pointerdown', wake, true);
        document.removeEventListener('keydown', wake, true);
      }
    };

    document.addEventListener('pointerdown', wake, true);
    document.addEventListener('keydown', wake, true);
  }

  /** An autoplay refusal, as opposed to a file that could not be loaded. */
  private blockedByBrowser(error: unknown): boolean {
    return (error as { name?: string } | null)?.name === 'NotAllowedError';
  }

  private element(name: SoundName): HTMLAudioElement {
    let element = this.cache.get(name);

    if (!element) {
      element = this.build(SOUNDS[name], false);
      // A 404 (or the app's index page served in its place) lands here.
      // Remember it so the next play goes straight to the synthesised cue.
      element.addEventListener('error', () => this.sources.set(name, 'synth'), { once: true });
      this.cache.set(name, element);
    }

    return element;
  }

  private buildMusic(): HTMLAudioElement {
    const element = this.build(MUSIC_TRACK, true);

    element.addEventListener(
      'error',
      () => {
        this.musicSource = 'synth';
        this.resumeMusic();
      },
      { once: true },
    );

    return element;
  }

  private build(src: string, loop: boolean): HTMLAudioElement {
    const element = new Audio(src);
    element.loop = loop;
    element.preload = 'auto';
    // A cue file that has not been added yet must not log an error on every
    // correct answer.
    element.onerror = () => undefined;

    return element;
  }

  private read(key: string, fallback: boolean): boolean {
    try {
      const stored = localStorage.getItem(key);

      return stored === null ? fallback : stored === 'true';
    } catch {
      // Private browsing, or storage switched off by policy.
      return fallback;
    }
  }

  private write(key: string, value: boolean): void {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      /* the preference just will not survive a reload */
    }
  }
}
