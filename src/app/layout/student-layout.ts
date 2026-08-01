import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { StudentAuthService } from '../services/student-auth/student-auth';
import { RewardService } from '../services/reward/reward';

interface GameNavItem {
  label: string;
  path: string;
  icon: string;
}

@Component({
  selector: 'app-student-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './student-layout.html',
  styleUrl: './student-layout.scss',
})
export class StudentLayout implements OnInit {
  private studentAuth = inject(StudentAuthService);
  private rewardService = inject(RewardService);
  private router = inject(Router);

  readonly student = this.studentAuth.student;
  readonly points = signal(0);
  readonly badgeCount = signal(0);

  // A playful "player level" derived from points (every 100 pts = 1 level).
  readonly playerLevel = computed(() => Math.floor(this.points() / 100) + 1);

  readonly navItems: GameNavItem[] = [
    { label: 'Home', path: '/student/home', icon: '🏠' },
    { label: 'Adventure', path: '/student/library', icon: '🗺️' },
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

  logout(): void {
    this.studentAuth.logout().subscribe({
      next: () => this.router.navigate(['/student/login']),
      error: () => this.router.navigate(['/student/login']),
    });
  }
}
