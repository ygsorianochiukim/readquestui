import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../services/auth/auth';
import { UploadService } from '../../services/upload/upload';
import { Alert, Button, Card, FormField, Spinner, Icon } from '../../shared/components';

interface ProfileForm {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  profile_image_url: string;
  password: string;
}

@Component({
  selector: 'app-profile',
  imports: [FormsModule, Alert, Button, Card, FormField, Spinner, Icon],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile implements OnInit {
  private auth = inject(AuthService);
  private uploadService = inject(UploadService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly photoUploading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  form: ProfileForm = {
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    profile_image_url: '',
    password: '',
  };

  ngOnInit(): void {
    const apply = () => {
      const teacher = this.auth.teacher();
      if (teacher) {
        this.form = {
          first_name: teacher.first_name,
          last_name: teacher.last_name,
          email: teacher.email,
          phone_number: teacher.phone_number ?? '',
          profile_image_url: teacher.profile_image_url ?? '',
          password: '',
        };
      }
      this.loading.set(false);
    };

    if (this.auth.teacher()) {
      apply();
    } else {
      this.auth.loadMe().subscribe({ next: apply, error: apply });
    }
  }

  save(): void {
    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const payload: Record<string, string> = {
      first_name: this.form.first_name,
      last_name: this.form.last_name,
      email: this.form.email,
      phone_number: this.form.phone_number,
      profile_image_url: this.form.profile_image_url,
    };
    if (this.form.password) {
      payload['password'] = this.form.password;
    }

    this.auth.updateProfile(payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.successMessage.set('Profile saved.');
        this.form.password = '';
      },
      error: (response: HttpErrorResponse) => {
        this.saving.set(false);
        this.errorMessage.set(this.readError(response));
      },
    });
  }

  /** Upload a new profile photo and keep its URL on the form. */
  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    this.photoUploading.set(true);
    this.errorMessage.set(null);

    this.uploadService.uploadImage(file).subscribe({
      next: (result) => {
        this.form.profile_image_url = result.data.url;
        this.photoUploading.set(false);
      },
      error: (response: HttpErrorResponse) => {
        this.photoUploading.set(false);
        this.errorMessage.set(this.readError(response));
      },
    });
  }

  removePhoto(): void {
    this.form.profile_image_url = '';
  }

  private readError(response: HttpErrorResponse): string {
    if (response.error?.errors) {
      const firstError = Object.values(response.error.errors)[0];
      if (Array.isArray(firstError)) {
        return firstError[0] as string;
      }
    }
    return response.error?.message ?? 'Could not save your profile. Please try again.';
  }
}
