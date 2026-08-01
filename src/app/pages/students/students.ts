import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { StudentPayload, StudentService } from '../../services/student/student';
import { BadgeService } from '../../services/badge/badge';
import { RewardService } from '../../services/reward/reward';
import { PronunciationService } from '../../services/pronunciation/pronunciation';
import { AssignmentService } from '../../services/assignment/assignment';
import { BookService } from '../../services/book/book';
import { Student, Badge as BadgeModel, Book, PronunciationAttempt } from '../../models';
import {
  ActionMenu,
  ActionMenuItem,
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  Modal,
  Spinner,
} from '../../shared/components';

@Component({
  selector: 'app-students',
  imports: [
    FormsModule,
    ActionMenu,
    Alert,
    Badge,
    Button,
    Card,
    EmptyState,
    FormField,
    Modal,
    Spinner,
  ],
  templateUrl: './students.html',
  styleUrl: './students.scss',
})
export class Students implements OnInit {
  private studentService = inject(StudentService);
  private badgeService = inject(BadgeService);
  private rewardService = inject(RewardService);
  private pronunciationService = inject(PronunciationService);
  private assignmentService = inject(AssignmentService);
  private bookService = inject(BookService);
  private router = inject(Router);

  readonly students = signal<Student[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly isFormOpen = signal(false);
  readonly editingStudentId = signal<number | null>(null);
  readonly errorMessage = signal<string | null>(null);

  studentForm: StudentPayload = this.emptyForm();

  readonly rowActions: ActionMenuItem[] = [
    { key: 'progress', label: '📈 Progress' },
    { key: 'books', label: '📚 Assign Books' },
    { key: 'scores', label: '🎤 Scores' },
    { key: 'rewards', label: '🏅 Rewards' },
    { key: 'edit', label: '✏️ Edit' },
    { key: 'delete', label: '🗑 Delete', danger: true },
  ];

  // ---- Rewards modal state ----
  readonly isRewardsOpen = signal(false);
  readonly rewardsStudent = signal<Student | null>(null);
  readonly allBadges = signal<BadgeModel[]>([]);
  readonly earnedBadgeIds = signal<number[]>([]);
  readonly rewardsPoints = signal(0);
  readonly rewardsLoading = signal(false);
  readonly busyBadgeId = signal<number | null>(null);

  // ---- Pronunciation review state ----
  readonly isScoresOpen = signal(false);
  readonly scoresStudent = signal<Student | null>(null);
  readonly attempts = signal<PronunciationAttempt[]>([]);
  readonly scoresLoading = signal(false);
  readonly validatingId = signal<number | null>(null);

  // ---- Book assignment state ----
  readonly isAssignOpen = signal(false);
  readonly assignStudent = signal<Student | null>(null);
  readonly allBooks = signal<Book[]>([]);
  readonly assignedBookIds = signal<number[]>([]);
  readonly assignLoading = signal(false);
  readonly assignSaving = signal(false);

  ngOnInit(): void {
    this.loadStudents();
  }

  /** Route a chosen dropdown action to its handler. */
  handleAction(key: string, student: Student): void {
    switch (key) {
      case 'progress':
        this.goProgress(student);
        break;
      case 'books':
        this.openAssign(student);
        break;
      case 'scores':
        this.openScores(student);
        break;
      case 'rewards':
        this.openRewards(student);
        break;
      case 'edit':
        this.openEditForm(student);
        break;
      case 'delete':
        this.deleteStudent(student);
        break;
    }
  }

  loadStudents(): void {
    this.loading.set(true);
    this.studentService.list().subscribe({
      next: (response) => {
        this.students.set(response.data);
        this.loading.set(false);
      },
      error: (response) => {
        this.errorMessage.set(this.readError(response));
        this.loading.set(false);
      },
    });
  }

  openCreateForm(): void {
    this.editingStudentId.set(null);
    this.studentForm = this.emptyForm();
    this.errorMessage.set(null);
    this.isFormOpen.set(true);
  }

  openEditForm(student: Student): void {
    this.editingStudentId.set(student.id);
    this.studentForm = {
      first_name: student.first_name,
      last_name: student.last_name,
      username: student.username,
      password: '',
      reading_level: student.reading_level ?? '',
      status: student.status,
    };
    this.errorMessage.set(null);
    this.isFormOpen.set(true);
  }

  closeForm(): void {
    this.isFormOpen.set(false);
  }

  saveStudent(): void {
    this.saving.set(true);
    this.errorMessage.set(null);

    const payload: StudentPayload = { ...this.studentForm };
    if (!payload.password) {
      delete payload.password;
    }

    const studentId = this.editingStudentId();
    const request = studentId
      ? this.studentService.update(studentId, payload)
      : this.studentService.create(payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.isFormOpen.set(false);
        this.loadStudents();
      },
      error: (response) => {
        this.saving.set(false);
        this.errorMessage.set(this.readError(response));
      },
    });
  }

  deleteStudent(student: Student): void {
    const confirmed = confirm(`Delete ${student.first_name} ${student.last_name}?`);
    if (!confirmed) {
      return;
    }
    this.studentService.remove(student.id).subscribe({
      next: () => this.loadStudents(),
      error: (response) => this.errorMessage.set(this.readError(response)),
    });
  }

  // ---- Rewards ----
  openRewards(student: Student): void {
    this.rewardsStudent.set(student);
    this.isRewardsOpen.set(true);
    this.rewardsLoading.set(true);
    this.errorMessage.set(null);

    this.badgeService.list().subscribe({
      next: (response) => this.allBadges.set(response.data),
      error: (response) => this.errorMessage.set(this.readError(response)),
    });

    this.rewardService.forStudent(student.id).subscribe({
      next: (summary) => {
        this.earnedBadgeIds.set(summary.data.map((badge) => badge.id));
        this.rewardsPoints.set(summary.points);
        this.rewardsLoading.set(false);
      },
      error: (response) => {
        this.errorMessage.set(this.readError(response));
        this.rewardsLoading.set(false);
      },
    });
  }

  closeRewards(): void {
    this.isRewardsOpen.set(false);
    this.rewardsStudent.set(null);
    // Refresh the roster so updated points show in the table.
    this.loadStudents();
  }

  isEarned(badgeId: number): boolean {
    return this.earnedBadgeIds().includes(badgeId);
  }

  toggleBadge(badge: BadgeModel): void {
    const student = this.rewardsStudent();
    if (!student) {
      return;
    }
    this.busyBadgeId.set(badge.id);

    const request = this.isEarned(badge.id)
      ? this.rewardService.revoke(student.id, badge.id)
      : this.rewardService.award(student.id, badge.id);

    request.subscribe({
      next: (summary) => {
        this.earnedBadgeIds.set(summary.data.map((earned) => earned.id));
        this.rewardsPoints.set(summary.points);
        this.busyBadgeId.set(null);
      },
      error: (response) => {
        this.errorMessage.set(this.readError(response));
        this.busyBadgeId.set(null);
      },
    });
  }

  // ---- Pronunciation review ----
  openScores(student: Student): void {
    this.scoresStudent.set(student);
    this.isScoresOpen.set(true);
    this.scoresLoading.set(true);
    this.errorMessage.set(null);

    this.pronunciationService.forStudent(student.id).subscribe({
      next: (response) => {
        this.attempts.set(response.data);
        this.scoresLoading.set(false);
      },
      error: (response) => {
        this.errorMessage.set(this.readError(response));
        this.scoresLoading.set(false);
      },
    });
  }

  closeScores(): void {
    this.isScoresOpen.set(false);
    this.scoresStudent.set(null);
  }

  validateAttempt(attempt: PronunciationAttempt): void {
    this.validatingId.set(attempt.id);
    this.pronunciationService.validate(attempt.id).subscribe({
      next: (response) => {
        this.attempts.update((list) =>
          list.map((item) => (item.id === attempt.id ? response.data : item)),
        );
        this.validatingId.set(null);
      },
      error: (response) => {
        this.validatingId.set(null);
        this.errorMessage.set(this.readError(response));
      },
    });
  }

  // ---- Book assignment ----
  openAssign(student: Student): void {
    this.assignStudent.set(student);
    this.isAssignOpen.set(true);
    this.assignLoading.set(true);
    this.errorMessage.set(null);

    this.bookService.list().subscribe({
      next: (response) => this.allBooks.set(response.data),
      error: (response) => this.errorMessage.set(this.readError(response)),
    });

    this.assignmentService.forStudent(student.id).subscribe({
      next: (response) => {
        this.assignedBookIds.set(response.data.map((book) => book.id));
        this.assignLoading.set(false);
      },
      error: (response) => {
        this.errorMessage.set(this.readError(response));
        this.assignLoading.set(false);
      },
    });
  }

  closeAssign(): void {
    this.isAssignOpen.set(false);
    this.assignStudent.set(null);
  }

  isAssigned(bookId: number): boolean {
    return this.assignedBookIds().includes(bookId);
  }

  toggleAssignBook(bookId: number): void {
    this.assignedBookIds.update((ids) =>
      ids.includes(bookId) ? ids.filter((id) => id !== bookId) : [...ids, bookId],
    );
  }

  saveAssignments(): void {
    const student = this.assignStudent();
    if (!student) {
      return;
    }
    this.assignSaving.set(true);
    this.assignmentService.sync(student.id, this.assignedBookIds()).subscribe({
      next: () => {
        this.assignSaving.set(false);
        this.closeAssign();
      },
      error: (response) => {
        this.assignSaving.set(false);
        this.errorMessage.set(this.readError(response));
      },
    });
  }

  goProgress(student: Student): void {
    this.router.navigate(['/dashboard/students', student.id, 'progress']);
  }

  private emptyForm(): StudentPayload {
    return {
      first_name: '',
      last_name: '',
      username: '',
      password: '',
      reading_level: '',
      status: 'active',
    };
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
