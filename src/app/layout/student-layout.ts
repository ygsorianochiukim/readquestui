import { Component, computed, DestroyRef, inject, OnDestroy, OnInit, signal } from '@angular/core';
import {
  CheerOverlay,
  ConfettiOverlay,
  Icon,
  IconName,
  RewardToast,
  StickerIcon,
  ThemeScenery,
} from '../shared/components';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { StudentAuthService } from '../services/student-auth/student-auth';
import { RewardService } from '../services/reward/reward';
import { AudioService } from '../services/audio/audio';
import { ThemeService } from '../services/theme/theme';
import { NotificationService, StudentNotification } from '../services/notification/notification';

interface GameNavItem {
  label: string;
  path: string;
  /** Typed, so a nav item can never name an icon that does not exist. */
  icon: IconName;
}

@Component({
  selector: 'app-student-layout',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    CheerOverlay,
    ConfettiOverlay,
    Icon,
    RewardToast,
    StickerIcon,
    ThemeScenery,
  ],
  templateUrl: './student-layout.html',
  styleUrl: './student-layout.scss',
})
export class StudentLayout implements OnInit, OnDestroy {
  private studentAuth = inject(StudentAuthService);
  private rewardService = inject(RewardService);
  private audio = inject(AudioService);
  private themes = inject(ThemeService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private notifications = inject(NotificationService);
  private notificationPoll: ReturnType<typeof setInterval> | null = null;

  /** The open book's (or chapter's) theme; null outside a book. */
  readonly theme = this.themes.active;

  /**
   * The sound switch lives here as well as on the reading screen, because a
   * teacher who needs a room quiet needs to reach it from wherever the child
   * happens to be.
   */
  readonly muted = this.audio.muted;
  readonly musicEnabled = this.audio.musicEnabled;

  readonly student = this.studentAuth.student;
  readonly points = signal(0);
  readonly badgeCount = signal(0);

  // The bell: badges from the teacher and notes on the child's reading.
  readonly notificationItems = this.notifications.items;
  readonly unreadCount = this.notifications.unread;
  readonly bellOpen = signal(false);
  /** The phone menu holding sound, music and log out. */
  readonly moreOpen = signal(false);

  // A playful "player level" derived from points (every 100 pts = 1 level).
  readonly playerLevel = computed(() => Math.floor(this.points() / 100) + 1);

  readonly navItems: GameNavItem[] = [
    { label: 'Home', path: '/student/home', icon: 'home' },
    { label: 'Adventure', path: '/student/library', icon: 'map' },
    { label: 'Trophies', path: '/student/achievements', icon: 'trophy' },
  ];

  readonly fullName = computed(() => {
    const student = this.student();
    return student ? `${student.first_name} ${student.last_name}` : 'Player';
  });

  readonly firstName = computed(() => this.student()?.first_name ?? 'Reader');

  readonly initials = computed(() => {
    const student = this.student();
    if (!student) {
      return '?';
    }
    return `${student.first_name?.[0] ?? ''}${student.last_name?.[0] ?? ''}`.toUpperCase();
  });

  readonly avatarUrl = computed(() => this.student()?.profile_image_url ?? null);
  readonly level = computed(() => this.student()?.reading_level ?? null);

  ngOnInit(): void {
    // Started here, not by each screen, so the music plays on unbroken as the
    // child moves around — a new book changes its tune, never stops it.
    this.audio.startMusic();

    if (!this.student()) {
      this.studentAuth.loadMe().subscribe({ error: () => {} });
    }
    // New badges and teacher notes show up without a reload.
    this.loadNotifications();
    this.notificationPoll = setInterval(() => {
      this.loadNotifications();
      this.loadRewards();
    }, 60000);

    this.loadRewards();
    // Medals and stars stay current as the child earns them on other screens.
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadRewards();
        this.moreOpen.set(false);
      });
  }

  private loadRewards(): void {
    this.rewardService.mine().subscribe({
      next: (summary) => {
        this.points.set(summary.points);
        this.badgeCount.set(summary.data.length);
      },
      error: () => {},
    });
  }

  ngOnDestroy(): void {
    if (this.notificationPoll) {
      clearInterval(this.notificationPoll);
    }
    this.audio.stopMusic();
    this.themes.clear();
  }

  private loadNotifications(): void {
    this.notifications.load().subscribe({ error: () => {} });
  }

  toggleBell(): void {
    if (this.bellOpen()) {
      this.closeBell();
      return;
    }
    this.audio.play('tap', 0.4);
    this.bellOpen.set(true);
    this.loadNotifications();
  }

  /** Closing is what marks them seen, so new ones stay highlighted while open. */
  closeBell(): void {
    this.bellOpen.set(false);
    this.notifications.markRead();
    this.notifications.items.update((items) => items.map((item) => ({ ...item, unread: false })));
  }

  notificationIcon(item: StudentNotification): IconName {
    return item.type === 'badge' ? 'badges' : 'note';
  }

  /** "2 hours ago", in words a child can read. */
  ago(iso: string): string {
    const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.round(hours / 24);
    return days < 7 ? `${days} day${days === 1 ? '' : 's'} ago` : new Date(iso).toLocaleDateString();
  }

  toggleMute(): void {
    this.audio.toggleMute();
  }

  toggleMusic(): void {
    this.audio.toggleMusic();
  }

  logout(): void {
    this.studentAuth.logout().subscribe({
      next: () => this.router.navigate(['/student/login']),
      error: () => this.router.navigate(['/student/login']),
    });
  }
}
