import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

/** A badge from the teacher, or what the teacher said about a reading. */
export interface StudentNotification {
  id: string;
  type: 'badge' | 'review';
  title: string;
  message: string;
  /** The badge's own icon, for badge notifications. */
  icon: string | null;
  score: number | null;
  passed: boolean | null;
  unread: boolean;
  created_at: string;
}

interface NotificationFeed {
  data: StudentNotification[];
  meta: { unread: number };
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  readonly items = signal<StudentNotification[]>([]);
  readonly unread = signal(0);

  load(): Observable<NotificationFeed> {
    return this.http.get<NotificationFeed>(`${this.base}/student/notifications`).pipe(
      tap((feed) => {
        this.items.set(feed.data);
        this.unread.set(feed.meta.unread);
      }),
    );
  }

  /** The bell was opened: clear the count now, and tell the server. */
  markRead(): void {
    if (this.unread() === 0) {
      return;
    }
    this.unread.set(0);
    this.http.post(`${this.base}/student/notifications/read`, {}).subscribe({ error: () => {} });
  }
}
