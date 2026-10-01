import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import {
  CheerOverlay,
  Icon,
  IconName,
  RewardToast,
  StickerIcon,
  ThemeScenery,
} from '../shared/components';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { StudentAuthService } from '../services/student-auth/student-auth';
import { RewardService } from '../services/reward/reward';
import { AudioService } from '../services/audio/audio';
import { ThemeService } from '../services/theme/theme';

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
    this.rewardService.mine().subscribe({
      next: (summary) => {
        this.points.set(summary.points);
        this.badgeCount.set(summary.data.length);
      },
      error: () => {},
    });
  }

  ngOnDestroy(): void {
    this.audio.stopMusic();
    this.themes.clear();
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
