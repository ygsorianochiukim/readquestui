import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { prepareForScan } from './image-prep';

export interface UploadResult {
  data: {
    path: string;
    url: string;
  };
}

/** Text read out of a scanned/photographed page. */
export interface OcrResult {
  data: {
    text: string;
    characters: number;
    lines: number;
  };
}

@Injectable({ providedIn: 'root' })
export class UploadService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  /** Upload an image file and get back its public URL. */
  uploadImage(file: File): Observable<UploadResult> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<UploadResult>(`${this.base}/uploads/image`, form);
  }

  /**
   * Read the printed text out of a photo or scan of a page, so a teacher can
   * fill in a chapter's story without typing it all out.
   *
   * The image is shrunk first — Azure rejects anything over 4 MB or larger
   * than 10000×10000 pixels, which a phone photo easily exceeds.
   */
  scanText(file: File): Observable<OcrResult> {
    return from(prepareForScan(file)).pipe(
      switchMap((prepared) => {
        const form = new FormData();
        form.append('file', prepared);
        return this.http.post<OcrResult>(`${this.base}/ocr/extract`, form);
      }),
    );
  }
}
