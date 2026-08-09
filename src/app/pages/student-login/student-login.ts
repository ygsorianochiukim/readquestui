import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { StudentAuthService } from '../../services/student-auth/student-auth';
import { Alert, Button, FormField, Icon } from '../../shared/components';

@Component({
  selector: 'app-student-login',
  imports: [FormsModule, RouterLink, Alert, Button, FormField, Icon],
  templateUrl: './student-login.html',
  styleUrl: './student-login.scss',
})
export class StudentLogin {
  private studentAuth = inject(StudentAuthService);
  private router = inject(Router);

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  form = {
    username: '',
    password: '',
  };

  submit(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.studentAuth.login(this.form.username, this.form.password).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/student']);
      },
      error: (response: HttpErrorResponse) => {
        this.loading.set(false);
        this.errorMessage.set(this.readError(response));
      },
    });
  }

  private readError(response: HttpErrorResponse): string {
    return response.error?.message ?? 'Something went wrong. Please try again.';
  }
}
