import { Component, inject, input, output, signal } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { Icon } from '../icon/icon';
import { IconName } from '../icon/icons';

export interface ShellNavItem {
  label: string;
  path: string;
  icon: IconName;
}

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, Icon],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly navItems = input<ShellNavItem[]>([]);
  readonly name = input<string>('');
  readonly subtitle = input<string>('');
  readonly initials = input<string>('?');
  /** Optional profile photo; falls back to the initials when absent. */
  readonly avatarUrl = input<string | null>(null);

  readonly logout = output<void>();

  readonly sidebarOpen = signal(false);

  /** The current page's title, read from the active route's `data.title`. */
  readonly pageTitle = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.resolveTitle()),
    ),
    { initialValue: this.resolveTitle() },
  );

  toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  private resolveTitle(): string {
    let route: ActivatedRoute | null = this.route.root;
    while (route?.firstChild) {
      route = route.firstChild;
    }
    return (route?.snapshot?.data?.['title'] as string) ?? '';
  }
}
