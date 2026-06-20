import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVersionCoalescer } from "./version-coalescer";

describe("version coalescer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires once after the idle window when changes stop", () => {
    const flush = vi.fn();
    const c = createVersionCoalescer(flush, { idleMs: 10_000, capMs: 120_000 });
    c.onChange();
    vi.advanceTimersByTime(5_000);
    c.onChange(); // resets idle timer
    vi.advanceTimersByTime(9_999);
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("fires at the cap even under continuous edits", () => {
    const flush = vi.fn();
    const c = createVersionCoalescer(flush, { idleMs: 10_000, capMs: 120_000 });
    // Edit every 5s for 130s — idle never elapses, cap must fire at 120s.
    for (let t = 0; t < 130_000; t += 5_000) {
      c.onChange();
      vi.advanceTimersByTime(5_000);
    }
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("cancel() stops a pending flush", () => {
    const flush = vi.fn();
    const c = createVersionCoalescer(flush, { idleMs: 10_000, capMs: 120_000 });
    c.onChange();
    c.cancel();
    vi.advanceTimersByTime(200_000);
    expect(flush).not.toHaveBeenCalled();
  });

  it("re-arms a fresh window after firing", () => {
    const flush = vi.fn();
    const c = createVersionCoalescer(flush, { idleMs: 10_000, capMs: 120_000 });
    c.onChange();
    vi.advanceTimersByTime(10_000); // first idle window fires
    expect(flush).toHaveBeenCalledTimes(1);
    c.onChange(); // must start a brand-new window (idle + cap timers reset)
    vi.advanceTimersByTime(10_000);
    expect(flush).toHaveBeenCalledTimes(2);
  });
});
