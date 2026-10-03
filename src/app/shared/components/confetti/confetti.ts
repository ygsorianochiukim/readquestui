import {
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ConfettiBurst, ConfettiService } from '../../../services/confetti/confetti';

const COLOURS = ['#ff4d8d', '#ffc83d', '#52dd8c', '#4f83e6', '#ff9e63', '#b77fe3', '#3fd0d4'];

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  colour: string;
  angle: number;
  spin: number;
  /** Paper flutters side to side as it falls. */
  wobble: number;
  wobbleSpeed: number;
  shape: 'rect' | 'circle' | 'strip';
  /** Seconds left; pieces fade over their last second. */
  life: number;
  gravity: number;
  drag: number;
}

/** How long the popper emoji stays at the sides. */
const POPPER_MS = 1400;

/**
 * Confetti over the whole screen: party poppers at both sides, or a soft
 * shower from the top. Drawn on one canvas that ignores the pointer, so it can
 * never stand between a child and the next button. Skipped entirely when the
 * device asks for reduced motion.
 */
@Component({
  selector: 'app-confetti',
  template: `
    <canvas #canvas class="confetti" aria-hidden="true"></canvas>
    @if (poppers()) {
      <span class="popper popper--left" aria-hidden="true">🎉</span>
      <span class="popper popper--right" aria-hidden="true">🎉</span>
    }
  `,
  styles: `
    .confetti {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      z-index: 1250;
      pointer-events: none;
    }

    .popper {
      position: fixed;
      bottom: 6vh;
      z-index: 1251;
      font-size: clamp(3rem, 2rem + 4vw, 5.5rem);
      pointer-events: none;
      animation: popper 1.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    }

    /* The emoji points up and right; the right-hand one is mirrored to face in. */
    .popper--left {
      left: 2vw;
      --flip: 1;
    }

    .popper--right {
      right: 2vw;
      --flip: -1;
    }

    @keyframes popper {
      0% { transform: scaleX(var(--flip)) scale(0.2) rotate(20deg); opacity: 0; }
      15% { transform: scaleX(var(--flip)) scale(1.25) rotate(-10deg); opacity: 1; }
      30% { transform: scaleX(var(--flip)) scale(1) rotate(0deg); }
      80% { opacity: 1; }
      100% { transform: scaleX(var(--flip)) scale(0.9); opacity: 0; }
    }
  `,
})
export class ConfettiOverlay {
  private canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private service = inject(ConfettiService);

  readonly poppers = signal(false);

  private pieces: Piece[] = [];
  private frame: number | null = null;
  private last = 0;
  private popperTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const burst = this.service.burst();
      if (burst) {
        untracked(() => this.start(burst));
      }
    });

    inject(DestroyRef).onDestroy(() => {
      if (this.frame !== null) {
        cancelAnimationFrame(this.frame);
      }
      if (this.popperTimer) {
        clearTimeout(this.popperTimer);
      }
    });
  }

  private start(burst: ConfettiBurst): void {
    if (typeof window === 'undefined' || this.reducedMotion()) {
      return;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;

    if (burst.kind === 'sides') {
      this.pieces.push(...this.cannon(0, height, 1, width, height));
      this.pieces.push(...this.cannon(width, height, -1, width, height));
      this.showPoppers();
    } else {
      this.pieces.push(...this.shower(width, height));
    }

    if (this.frame === null) {
      this.last = performance.now();
      this.frame = requestAnimationFrame((time) => this.tick(time));
    }
  }

  /** A popper in a bottom corner, firing up and in towards the middle. */
  private cannon(x: number, y: number, direction: 1 | -1, width: number, height: number): Piece[] {
    const power = Math.max(height, width * 0.6);

    return Array.from({ length: 90 }, () => {
      // Mostly upward, leaning inwards: 55°–85° above the floor.
      const angle = ((55 + Math.random() * 30) * Math.PI) / 180;
      const speed = power * (0.9 + Math.random() * 0.7);

      return this.piece({
        x: x + direction * Math.random() * 20,
        y: y - Math.random() * 20,
        vx: direction * Math.cos(angle) * speed,
        vy: -Math.sin(angle) * speed,
        life: 2.6 + Math.random() * 1.2,
        gravity: power * 1.3,
        drag: 1.6,
      });
    });
  }

  /** A gentle fall from above the screen, drifting as it goes. */
  private shower(width: number, height: number): Piece[] {
    return Array.from({ length: 140 }, () =>
      this.piece({
        x: Math.random() * width,
        y: -20 - Math.random() * height * 0.6,
        vx: (Math.random() - 0.5) * 40,
        vy: 60 + Math.random() * 80,
        life: 4 + Math.random() * 1.5,
        gravity: 30,
        drag: 0.4,
      }),
    );
  }

  private piece(base: Pick<Piece, 'x' | 'y' | 'vx' | 'vy' | 'life' | 'gravity' | 'drag'>): Piece {
    const shapes: Piece['shape'][] = ['rect', 'rect', 'circle', 'strip'];

    return {
      ...base,
      size: 6 + Math.random() * 7,
      colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 12,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 3 + Math.random() * 4,
      shape: shapes[Math.floor(Math.random() * shapes.length)],
    };
  }

  private tick(time: number): void {
    const canvas = this.canvas().nativeElement;
    const context = canvas.getContext('2d');
    const dt = Math.min(0.05, (time - this.last) / 1000);
    this.last = time;

    if (!context) {
      this.frame = null;
      return;
    }

    const ratio = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    this.pieces = this.pieces.filter((piece) => piece.life > 0 && piece.y < height + 40);

    for (const piece of this.pieces) {
      piece.life -= dt;
      piece.vx -= piece.vx * piece.drag * dt;
      piece.vy += piece.gravity * dt - piece.vy * piece.drag * dt * 0.5;
      piece.wobble += piece.wobbleSpeed * dt;
      piece.x += (piece.vx + Math.sin(piece.wobble) * 30) * dt;
      piece.y += piece.vy * dt;
      piece.angle += piece.spin * dt;

      context.save();
      context.globalAlpha = Math.max(0, Math.min(1, piece.life));
      context.translate(piece.x, piece.y);
      context.rotate(piece.angle);
      context.fillStyle = piece.colour;

      if (piece.shape === 'circle') {
        context.beginPath();
        context.arc(0, 0, piece.size / 2.4, 0, Math.PI * 2);
        context.fill();
      } else {
        // A flat piece of paper turning over: its height shrinks and grows.
        const flip = Math.abs(Math.cos(piece.wobble));
        const long = piece.shape === 'strip' ? piece.size * 1.8 : piece.size;
        context.fillRect(-piece.size / 2, (-long / 2) * flip, piece.size, long * flip);
      }

      context.restore();
    }

    if (this.pieces.length) {
      this.frame = requestAnimationFrame((next) => this.tick(next));
    } else {
      context.clearRect(0, 0, width, height);
      this.frame = null;
    }
  }

  private showPoppers(): void {
    // Re-mount the emoji so a second burst replays its pop.
    this.poppers.set(false);
    if (this.popperTimer) {
      clearTimeout(this.popperTimer);
    }
    requestAnimationFrame(() => this.poppers.set(true));
    this.popperTimer = setTimeout(() => this.poppers.set(false), POPPER_MS);
  }

  private reducedMotion(): boolean {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }
}
