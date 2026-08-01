import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { BadgePayload, BadgeService } from '../../services/badge/badge';
import { Badge } from '../../models';
import {
  Alert,
  Button,
  EmptyState,
  FormField,
  Modal,
  Spinner,
} from '../../shared/components';

@Component({
  selector: 'app-badges',
  imports: [FormsModule, Alert, Button, EmptyState, FormField, Modal, Spinner],
  templateUrl: './badges.html',
  styleUrl: './badges.scss',
})
export class Badges implements OnInit {
  private badgeService = inject(BadgeService);

  readonly badges = signal<Badge[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly isFormOpen = signal(false);
  readonly editingBadgeId = signal<number | null>(null);
  readonly errorMessage = signal<string | null>(null);

  badgeForm: BadgePayload = this.emptyForm();

  ngOnInit(): void {
    this.loadBadges();
  }

  loadBadges(): void {
    this.loading.set(true);
    this.badgeService.list().subscribe({
      next: (response) => {
        this.badges.set(response.data);
        this.loading.set(false);
      },
      error: (response) => {
        this.errorMessage.set(this.readError(response));
        this.loading.set(false);
      },
    });
  }

  openCreateForm(): void {
    this.editingBadgeId.set(null);
    this.badgeForm = this.emptyForm();
    this.errorMessage.set(null);
    this.isFormOpen.set(true);
  }

  openEditForm(badge: Badge): void {
    this.editingBadgeId.set(badge.id);
    this.badgeForm = {
      name: badge.name,
      icon: badge.icon ?? '',
      description: badge.description ?? '',
      criteria: badge.criteria ?? '',
      points: badge.points,
      status: badge.status,
    };
    this.errorMessage.set(null);
    this.isFormOpen.set(true);
  }

  closeForm(): void {
    this.isFormOpen.set(false);
  }

  saveBadge(): void {
    this.saving.set(true);
    this.errorMessage.set(null);

    const badgeId = this.editingBadgeId();
    const request = badgeId
      ? this.badgeService.update(badgeId, this.badgeForm)
      : this.badgeService.create(this.badgeForm);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.isFormOpen.set(false);
        this.loadBadges();
      },
      error: (response) => {
        this.saving.set(false);
        this.errorMessage.set(this.readError(response));
      },
    });
  }

  deleteBadge(badge: Badge): void {
    const confirmed = confirm(`Delete the "${badge.name}" badge?`);
    if (!confirmed) {
      return;
    }
    this.badgeService.remove(badge.id).subscribe({
      next: () => this.loadBadges(),
      error: (response) => this.errorMessage.set(this.readError(response)),
    });
  }

  private emptyForm(): BadgePayload {
    return { name: '', icon: '', description: '', criteria: '', points: 10, status: 'active' };
  }

  private readError(response: HttpErrorResponse): string {
    if (response.error?.errors) {
      const firstError = Object.values(response.error.errors)[0];
      if (Array.isArray(firstError)) {
        return firstError[0] as string;
      }
    }
    return response.error?.message ?? 'Request failed. Please try again.';
  }
}
