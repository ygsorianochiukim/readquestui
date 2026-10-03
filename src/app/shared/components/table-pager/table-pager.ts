import { Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Icon } from '../icon/icon';

/**
 * The footer under every data table: rows per page, "21–40 of 57", and the
 * page buttons. It only reports what was picked; the page owning the table
 * does the fetching (or slicing) and passes the new numbers back in.
 */
@Component({
  selector: 'app-table-pager',
  imports: [FormsModule, Icon],
  template: `
    <footer class="pager">
      <label class="pager__size">
        Rows per page
        <select class="pager__select" [ngModel]="perPage()" (ngModelChange)="perPageChange.emit(+$event)">
          @for (size of pageSizes(); track size) {
            <option [ngValue]="size">{{ size }}</option>
          }
        </select>
      </label>

      <span class="pager__range">{{ firstShown() }}–{{ lastShown() }} of {{ total() }}</span>

      <nav class="pager__pages" aria-label="Pages">
        <button
          type="button"
          class="pager__btn"
          [disabled]="page() <= 1 || loading()"
          aria-label="Previous page"
          (click)="go(page() - 1)">
          <app-icon name="back" size="sm" />
        </button>
        @for (number of pageNumbers(); track $index) {
          @if (number === null) {
            <span class="pager__gap" aria-hidden="true">…</span>
          } @else {
            <button
              type="button"
              class="pager__btn"
              [class.pager__btn--current]="number === page()"
              [attr.aria-current]="number === page() ? 'page' : null"
              [disabled]="loading()"
              (click)="go(number)">
              {{ number }}
            </button>
          }
        }
        <button
          type="button"
          class="pager__btn"
          [disabled]="page() >= lastPage() || loading()"
          aria-label="Next page"
          (click)="go(page() + 1)">
          <app-icon name="forward" size="sm" />
        </button>
      </nav>
    </footer>
  `,
  styleUrl: './table-pager.scss',
})
export class TablePager {
  readonly page = input.required<number>();
  readonly perPage = input.required<number>();
  readonly total = input.required<number>();
  readonly pageSizes = input<number[]>(PAGE_SIZES);
  readonly loading = input(false);

  readonly pageChange = output<number>();
  readonly perPageChange = output<number>();

  readonly lastPage = computed(() => Math.max(1, Math.ceil(this.total() / this.perPage())));
  readonly firstShown = computed(() =>
    this.total() === 0 ? 0 : (this.page() - 1) * this.perPage() + 1,
  );
  readonly lastShown = computed(() => Math.min(this.total(), this.page() * this.perPage()));

  /** The first, the last, and two either side of this one; gaps as null. */
  readonly pageNumbers = computed<(number | null)[]>(() => {
    const current = this.page();
    const last = this.lastPage();
    const pages: (number | null)[] = [];

    for (let number = 1; number <= last; number++) {
      if (number === 1 || number === last || Math.abs(number - current) <= 2) {
        pages.push(number);
      } else if (pages[pages.length - 1] !== null) {
        pages.push(null);
      }
    }

    return pages;
  });

  go(page: number): void {
    if (page >= 1 && page <= this.lastPage() && page !== this.page()) {
      this.pageChange.emit(page);
    }
  }
}

export const PAGE_SIZES = [10, 20, 50, 100];

/** The rows of one page, for a table that holds every row already. */
export function pageOf<T>(rows: T[], page: number, perPage: number): T[] {
  return rows.slice((page - 1) * perPage, page * perPage);
}

/** The page size a table was last left on, on this device. */
export function storedPageSize(key: string, fallback = 20): number {
  try {
    const stored = Number(localStorage.getItem(`readquest.table.${key}.per-page`));
    return PAGE_SIZES.includes(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

export function storePageSize(key: string, size: number): void {
  try {
    localStorage.setItem(`readquest.table.${key}.per-page`, String(size));
  } catch {
    /* the choice just will not survive a reload */
  }
}
