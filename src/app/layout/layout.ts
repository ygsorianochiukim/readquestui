import { Component, computed, inject, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from '../services/auth/auth';
import { AppShell, ShellNavItem } from '../shared/components';

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, AppShell],
  template: `
    <app-shell
      [navItems]="navItems"
      [name]="fullName()"
      subtitle="Teacher Dashboard"
      [initials]="initials()"
      [avatarUrl]="avatarUrl()"
      (logout)="logout()">
      <router-outlet />
    </app-shell>
  `,
})
export class Layout implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly teacher = this.auth.teacher;

  readonly navItems: ShellNavItem[] = [
    { label: 'Dashboard', path: '/dashboard/home', icon: 'dashboard' },
    { label: 'Students', path: '/dashboard/students', icon: 'students' },
    { label: 'Books & Content', path: '/dashboard/books', icon: 'books' },
    { label: 'Badges & Rewards', path: '/dashboard/badges', icon: 'badges' },
    { label: 'Activity Log', path: '/dashboard/activity-log', icon: 'log' },
    { label: 'My Profile', path: '/dashboard/profile', icon: 'profile' },
  ];

  readonly fullName = computed(() => {
    const teacher = this.teacher();
    return teacher ? `${teacher.first_name} ${teacher.last_name}` : '';
  });

  readonly initials = computed(() => {
    const teacher = this.teacher();
    if (!teacher) {
      return '?';
    }
    return `${teacher.first_name?.[0] ?? ''}${teacher.last_name?.[0] ?? ''}`.toUpperCase();
  });

  readonly avatarUrl = computed(() => this.teacher()?.profile_image_url ?? null);

  ngOnInit(): void {
    if (!this.teacher()) {
      this.auth.loadMe().subscribe({ error: () => {} });
    }
  }

  logout(): void {
    this.auth.logout().subscribe({
      next: () => this.router.navigate(['/login']),
      error: () => this.router.navigate(['/login']),
    });
  }
}
