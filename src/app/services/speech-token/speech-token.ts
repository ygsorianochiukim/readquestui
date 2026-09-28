import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, finalize, map, of, shareReplay, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../models';

export interface SpeechToken {
  token: string;
  region: string;
  expires_in: number;
}

/**
 * Short-lived credentials for talking to Azure Speech straight from the
 * browser.
 *
 * The subscription key never comes down here — the API mints a token scoped to
 * one region that dies in ten minutes. We cache it, because a child reading
 * three pages in a row should not cost three round trips, and refresh it a
 * minute early so a long reading is never cut off mid-sentence.
 */
@Injectable({ providedIn: 'root' })
export class SpeechTokenService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  private cached: SpeechToken | null = null;
  private expiresAt = 0;
  private inFlight: Observable<SpeechToken> | null = null;

  get(): Observable<SpeechToken> {
    if (this.cached && Date.now() < this.expiresAt) {
      return of(this.cached);
    }

    // Two components can ask at once (the reader and an activity); one request
    // serves both.
    if (this.inFlight) {
      return this.inFlight;
    }

    const request: Observable<SpeechToken> = this.http
      .post<ApiResponse<SpeechToken>>(`${this.base}/speech/token`, {})
      .pipe(
        map((response) => response.data),
        tap((token) => {
          this.cached = token;
          // A minute of headroom: a token that expires while a child is
          // halfway through a page ends their reading with an error.
          this.expiresAt = Date.now() + Math.max(0, token.expires_in - 60) * 1000;
        }),
        // Cleared on success *and* failure: a failed request left in flight
        // would be replayed, error and all, to every later caller.
        // Only if it is still ours: clear() may have started a newer one.
        finalize(() => {
          if (this.inFlight === request) {
            this.inFlight = null;
          }
        }),
        shareReplay(1),
      );

    this.inFlight = request;

    return request;
  }

  /** Forget the cached token — used when Azure rejects it as expired. */
  clear(): void {
    this.cached = null;
    this.expiresAt = 0;
    this.inFlight = null;
  }
}
