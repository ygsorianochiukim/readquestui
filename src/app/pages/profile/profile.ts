import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../services/auth/auth';
import { Alert, Button, Card, FormField, Spinner } from '../../shared/components';

interface ProfileForm {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  password: string;
}

@Component({
  selector: 'app-profile',
  imports: [FormsModule, Alert, Button, Card, FormField, Spinner],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile implements OnInit {
  private auth = inject(AuthService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  form: ProfileForm = { first_name: '', last_name: '', email: '', phone_number: '', password: '' };

  ngOnInit(): void {
    const apply = () => {
      const teacher = this.auth.teacher();
      if (teacher) {
        this.form = {
          first_name: teacher.first_name,
          last_name: teacher.last_name,
          email: teacher.email,
          phone_number: teacher.phone_number ?? '',
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
