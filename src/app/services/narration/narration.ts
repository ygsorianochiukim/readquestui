import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class NarrationService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  /** Fetch a chapter's narration audio (MP3) as a Blob for playback. */
  getNarration(chapterId: number): Observable<Blob> {
    return this.http.get(`${this.base}/chapters/${chapterId}/narration`, {
      responseType: 'blob',
    });
  }

  /**
   * Fetch a page's narration audio (MP3) as a Blob for playback. With a
   * paragraph, only that paragraph — one page of the student's flip book.
   */
  getPageNarration(pageId: number, paragraph?: number): Observable<Blob> {
    return this.http.get(`${this.base}/pages/${pageId}/narration`, {
      responseType: 'blob',
      params: paragraph == null ? {} : { paragraph },
    });
  }

  /** Clips already fetched this session, by text, so a replay is instant. */
  private readonly clips = new Map<string, string>();
  private player: HTMLAudioElement | null = null;

  /**
   * Say a word or sentence in the narration voice. Falls back to the
   * browser's own voice when Azure cannot be reached, so the button never
   * goes quiet.
   *
   * @param rate below 1 to slow it down for a child sounding a word out
   */
  async say(text: string, rate = 0.85): Promise<void> {
    const phrase = text.trim();
    if (!phrase) {
      return;
    }

    this.stopSaying();

    try {
      let url = this.clips.get(phrase);
      if (!url) {
        const blob = await firstValueFrom(
          this.http.get(`${this.base}/speech/say`, {
            responseType: 'blob',
            params: { text: phrase },
          }),
        );
        url = URL.createObjectURL(blob);
        this.clips.set(phrase, url);
      }

      const player = new Audio(url);
      player.playbackRate = rate;
      this.player = player;
      await player.play();
    } catch {
      this.speakWithBrowser(phrase, rate);
    }
  }

  /** Cut off whatever {@link say} is saying. */
  stopSaying(): void {
    this.player?.pause();
    this.player = null;
    try {
      speechSynthesis.cancel();
    } catch {
      /* no speech synthesis on this device */
    }
  }

  private speakWithBrowser(text: string, rate: number): void {
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = rate;
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    } catch {
      /* no speech synthesis on this device */
    }
  }
}
