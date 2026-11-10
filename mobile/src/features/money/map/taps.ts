import { DOUBLE_TAP_MS, isDoubleTap, type TapPoint } from './camera';

/**
 * Tells single taps from double taps on JS. A native tap made to wait for
 * a double tap to fail never fired at all on iOS, so the stage reports
 * every tap here: a second tap inside the window is a double tap, and a
 * lone tap is reported once the window has passed, so a double tap never
 * shows a focus first.
 */
export class TapRouter {
  private last: TapPoint | null = null;
  private pending: ReturnType<typeof setTimeout> | null = null;
  constructor(
    private readonly onSingle: (x: number, y: number) => void,
    private readonly onDouble: (x: number, y: number) => void,
    private readonly window = DOUBLE_TAP_MS,
  ) {}

  tap(x: number, y: number, at = Date.now()) {
    const next: TapPoint = { x, y, at };
    if (isDoubleTap(this.last, next, this.window)) {
      this.last = null;
      this.cancel();
      this.onDouble(x, y);
      return 'double' as const;
    }
    this.cancel();
    this.last = next;
    this.pending = setTimeout(() => {
      this.pending = null;
      this.onSingle(x, y);
    }, this.window);
    return 'pending' as const;
  }

  /** Drops a tap still waiting for its window; on unmount or a new router. */
  cancel() {
    if (this.pending !== null) {
      clearTimeout(this.pending);
      this.pending = null;
    }
  }
}
