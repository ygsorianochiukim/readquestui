import { Component, ElementRef, HostListener, inject, input, output, signal } from '@angular/core';
import { Icon } from '../icon/icon';
import { IconName } from '../icon/icons';

export interface ActionMenuItem {
  key: string;
  label: string;
  icon?: IconName;
  danger?: boolean;
}

/**
 * A compact "Actions ▾" dropdown. The panel is positioned with fixed
 * coordinates read from the trigger, so it is never clipped by a
 * scrolling table wrapper.
 */
@Component({
  selector: 'app-action-menu',
  imports: [Icon],
  templateUrl: './action-menu.html',
  styleUrl: './action-menu.scss',
})
export class ActionMenu {
  private host = inject(ElementRef<HTMLElement>);

  readonly items = input<ActionMenuItem[]>([]);
  readonly label = input<string>('Actions');

  readonly selected = output<string>();

  readonly open = signal(false);
  readonly top = signal(0);
  readonly left = signal(0);

  toggle(event: MouseEvent): void {
    event.stopPropagation();
    if (this.open()) {
      this.open.set(false);
      return;
    }
    const trigger = event.currentTarget as HTMLElement;
    const rect = trigger.getBoundingClientRect();
    this.top.set(rect.bottom + 6);
    this.left.set(rect.right);
    this.open.set(true);
  }

  choose(item: ActionMenuItem): void {
    this.open.set(false);
    this.selected.emit(item.key);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.open()) {
      this.open.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.open.set(false);
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  onViewportChange(): void {
    if (this.open()) {
      this.open.set(false);
    }
  }
}
