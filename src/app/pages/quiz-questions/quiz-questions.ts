import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { QuizQuestionPayload, QuizQuestionService } from '../../services/quiz-question/quiz-question';
import { QuizQuestion } from '../../models';
import {
  Alert,
  Button,
  EmptyState,
  FormField,
  Modal,
  Spinner,
  Icon,
} from '../../shared/components';

@Component({
  selector: 'app-quiz-questions',
  imports: [
    FormsModule,
    Alert,
    Button,
    EmptyState,
    FormField,
    Modal,
    Spinner,
    Icon
  ],
  templateUrl: './quiz-questions.html',
  styleUrl: './quiz-questions.scss',
})
export class QuizQuestions implements OnInit {
  private quizQuestionService = inject(QuizQuestionService);
  private route = inject(ActivatedRoute);
  private location = inject(Location);

  readonly chapterId = Number(this.route.snapshot.paramMap.get('chapterId'));
  readonly questions = signal<QuizQuestion[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly regenerating = signal(false);
  readonly isFormOpen = signal(false);
  readonly editingQuestionId = signal<number | null>(null);
  readonly errorMessage = signal<string | null>(null);

  questionForm: QuizQuestionPayload = this.emptyForm();

  ngOnInit(): void {
    this.loadQuestions();
  }

  goBack(): void {
    this.location.back();
  }

  loadQuestions(): void {
    this.loading.set(true);
    this.quizQuestionService.listForChapter(this.chapterId).subscribe({
      next: (response) => {
        this.questions.set(response.data);
        this.loading.set(false);
      },
      error: (response) => {
        this.errorMessage.set(this.readError(response));
        this.loading.set(false);
      },
    });
  }

  /**
   * Write the questions again from the chapter's text. Nothing is typed from
   * scratch; questions the teacher corrected are kept by the API.
   */
  regenerate(): void {
    if (this.questions().some((question) => question.is_generated)
      && !confirm('Write a fresh set of questions? The generated ones will be replaced; ones you edited are kept.')) {
      return;
    }

    this.regenerating.set(true);
    this.errorMessage.set(null);

    this.quizQuestionService.regenerate(this.chapterId).subscribe({
      next: (response) => {
        this.questions.set(response.data);
        this.regenerating.set(false);
        if (response.data.length === 0) {
          this.errorMessage.set('Could not write questions from this chapter\'s text. It may be too short.');
        }
      },
      error: (response: HttpErrorResponse) => {
        this.regenerating.set(false);
        this.errorMessage.set(this.readError(response));
      },
    });
  }

  openEditForm(question: QuizQuestion): void {
    this.editingQuestionId.set(question.id);
    this.questionForm = {
      question_text: question.question_text,
      choices: [...question.choices],
      correct_answer: question.correct_answer,
    };
    this.errorMessage.set(null);
    this.isFormOpen.set(true);
  }

  closeForm(): void {
    this.isFormOpen.set(false);
  }

  updateChoice(index: number, value: string): void {
    const previousValue = this.questionForm.choices[index];
    this.questionForm.choices[index] = value;
    // Keep the chosen correct answer in sync when its text is edited.
    if (this.questionForm.correct_answer === previousValue) {
      this.questionForm.correct_answer = value;
    }
  }

  removeChoice(index: number): void {
    if (this.questionForm.choices.length <= 2) {
      return;
    }
    const [removed] = this.questionForm.choices.splice(index, 1);
    if (this.questionForm.correct_answer === removed) {
      this.questionForm.correct_answer = '';
    }
  }

  saveQuestion(): void {
    this.errorMessage.set(null);

    const choices = this.questionForm.choices.map((choice) => choice.trim()).filter(Boolean);
    if (choices.length < 2) {
      this.errorMessage.set('Please provide at least two choices.');
      return;
    }
    if (!this.questionForm.correct_answer || !choices.includes(this.questionForm.correct_answer)) {
      this.errorMessage.set('Please select which choice is the correct answer.');
      return;
    }

    // Only corrections to an existing (generated) question are saved here.
    const questionId = this.editingQuestionId();
    if (!questionId) {
      return;
    }

    this.saving.set(true);
    const payload: QuizQuestionPayload = {
      question_text: this.questionForm.question_text,
      choices,
      correct_answer: this.questionForm.correct_answer,
    };

    this.quizQuestionService.update(questionId, payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.isFormOpen.set(false);
        this.loadQuestions();
      },
      error: (response) => {
        this.saving.set(false);
        this.errorMessage.set(this.readError(response));
      },
    });
  }

  deleteQuestion(question: QuizQuestion): void {
    const confirmed = confirm('Delete this question?');
    if (!confirmed) {
      return;
    }
    this.quizQuestionService.remove(question.id).subscribe({
      next: () => this.loadQuestions(),
      error: (response) => this.errorMessage.set(this.readError(response)),
    });
  }

  private emptyForm(): QuizQuestionPayload {
    return { question_text: '', choices: ['', ''], correct_answer: '' };
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
