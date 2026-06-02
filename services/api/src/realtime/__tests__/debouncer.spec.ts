import { PerKeyDebouncer, Timer } from '../debouncer';

class FakeTimers {
  private nextId = 1;
  private timers = new Map<number, { at: number; fn: () => void }>();
  now = 0;

  set: (fn: () => void, ms: number) => Timer = (fn, ms) => {
    const id = this.nextId++;
    this.timers.set(id, { at: this.now + ms, fn });
    return id as unknown as Timer;
  };
  clear: (t: Timer) => void = (t) => {
    this.timers.delete(t as unknown as number);
  };
  advance(ms: number) {
    this.now += ms;
    for (const [id, t] of [...this.timers.entries()]) {
      if (t.at <= this.now) {
        this.timers.delete(id);
        t.fn();
      }
    }
  }
}

describe('PerKeyDebouncer', () => {
  let timers: FakeTimers;
  beforeEach(() => {
    timers = new FakeTimers();
  });

  const make = () =>
    new PerKeyDebouncer<string>({
      delayMs: 250,
      setTimeoutFn: timers.set,
      clearTimeoutFn: timers.clear,
    });

  it('runs the callback once after delay', () => {
    const d = make();
    let n = 0;
    d.schedule('u1', () => {
      n++;
    });
    timers.advance(249);
    expect(n).toBe(0);
    timers.advance(1);
    expect(n).toBe(1);
  });

  it('coalesces multiple schedules for the same key into one run', () => {
    const d = make();
    let n = 0;
    d.schedule('u1', () => {
      n++;
    });
    timers.advance(100);
    d.schedule('u1', () => {
      n++;
    });
    timers.advance(100);
    d.schedule('u1', () => {
      n++;
    });
    timers.advance(250);
    expect(n).toBe(1); // only the last one fires, after the final 250ms
  });

  it('different keys run independently', () => {
    const d = make();
    const fired: string[] = [];
    d.schedule('a', () => {
      fired.push('a');
    });
    d.schedule('b', () => {
      fired.push('b');
    });
    timers.advance(250);
    expect(fired.sort()).toEqual(['a', 'b']);
  });

  it('cancel prevents a scheduled run', () => {
    const d = make();
    let fired = false;
    d.schedule('u1', () => {
      fired = true;
    });
    expect(d.cancel('u1')).toBe(true);
    timers.advance(1000);
    expect(fired).toBe(false);
  });
});
