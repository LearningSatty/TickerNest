/**
 * Per-key debouncer. Used to coalesce many `portfolio_changed` notifications
 * for the same user into one MV refresh.
 *
 * Pure-domain, time-injected so the unit test doesn't sleep.
 */
export type Clock = () => number;
export type Timer = ReturnType<typeof setTimeout>;

export interface DebouncerOpts {
  delayMs: number;
  clock?: Clock;
  setTimeoutFn?: (fn: () => void, ms: number) => Timer;
  clearTimeoutFn?: (t: Timer) => void;
}

export class PerKeyDebouncer<K> {
  private readonly pending = new Map<K, Timer>();
  private readonly opts: Required<DebouncerOpts>;

  constructor(opts: DebouncerOpts) {
    this.opts = {
      delayMs: opts.delayMs,
      clock: opts.clock ?? (() => Date.now()),
      setTimeoutFn: opts.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms)),
      clearTimeoutFn: opts.clearTimeoutFn ?? ((t) => clearTimeout(t)),
    };
  }

  schedule(key: K, fn: () => void | Promise<void>): void {
    const existing = this.pending.get(key);
    if (existing) this.opts.clearTimeoutFn(existing);
    const timer = this.opts.setTimeoutFn(async () => {
      this.pending.delete(key);
      try {
        await fn();
      } catch {
        /* the caller is responsible for logging */
      }
    }, this.opts.delayMs);
    this.pending.set(key, timer);
  }

  cancel(key: K): boolean {
    const t = this.pending.get(key);
    if (!t) return false;
    this.opts.clearTimeoutFn(t);
    this.pending.delete(key);
    return true;
  }

  cancelAll(): void {
    for (const t of this.pending.values()) this.opts.clearTimeoutFn(t);
    this.pending.clear();
  }

  size(): number {
    return this.pending.size;
  }
}
