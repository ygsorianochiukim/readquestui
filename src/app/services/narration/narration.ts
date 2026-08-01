import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
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

  /** Fetch a scanned page's narration audio (MP3) as a Blob for playback. */
  getPageNarration(pageId: number): Observable<Blob> {
    return this.http.get(`${this.base}/pages/${pageId}/narration`, {
      responseType: 'blob',
    });
  }
}
