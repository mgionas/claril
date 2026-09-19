import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosaver, type SaveState } from "@/lib/autosaver";

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(delayMs = 800) {
  const calls: { content: string; d: ReturnType<typeof deferred> }[] = [];
  const states: SaveState[] = [];
  const saver = createAutosaver({
    delayMs,
    save: (content) => {
      const d = deferred();
      calls.push({ content, d });
      return d.promise;
    },
    onState: (s) => states.push(s),
  });
  return { saver, calls, states, last: () => states[states.length - 1] };
}

describe("createAutosaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("debounces edits and saves only the latest content", async () => {
    const { saver, calls, last } = setup();
    saver.schedule("a");
    saver.schedule("ab");
    expect(last()).toBe("saving");
    await vi.advanceTimersByTimeAsync(800);
    expect(calls.map((c) => c.content)).toEqual(["ab"]);
    calls[0].d.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(last()).toBe("saved");
    expect(saver.isDirty()).toBe(false);
  });

  it("does not report saved while a newer edit is still pending", async () => {
    const { saver, calls, last } = setup();
    saver.schedule("v1");
    await vi.advanceTimersByTimeAsync(800); // v1 in flight
    saver.schedule("v2"); // newer edit waiting on the debounce
    calls[0].d.resolve(); // v1 finishes late
    await vi.advanceTimersByTimeAsync(0);
    expect(last()).toBe("saving");
    await vi.advanceTimersByTimeAsync(800);
    calls[1].d.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(last()).toBe("saved");
  });

  it("ignores a stale failure once a newer save succeeded", async () => {
    const { saver, calls, last } = setup();
    saver.schedule("v1");
    await vi.advanceTimersByTimeAsync(800);
    saver.schedule("v2");
    await vi.advanceTimersByTimeAsync(800);
    calls[1].d.resolve();
    await vi.advanceTimersByTimeAsync(0);
    calls[0].d.reject(new Error("late"));
    await vi.advanceTimersByTimeAsync(0);
    expect(last()).toBe("saved");
  });

  it("reports error and retry re-sends the failed content", async () => {
    const { saver, calls, last } = setup();
    saver.schedule("x");
    await vi.advanceTimersByTimeAsync(800);
    calls[0].d.reject(new Error("offline"));
    await vi.advanceTimersByTimeAsync(0);
    expect(last()).toBe("error");
    expect(saver.isDirty()).toBe(true);
    saver.retry();
    expect(calls[1].content).toBe("x");
    calls[1].d.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(last()).toBe("saved");
  });

  it("flush saves a pending edit immediately (e.g. on unmount)", () => {
    const { saver, calls } = setup();
    saver.schedule("unsaved");
    saver.flush();
    expect(calls.map((c) => c.content)).toEqual(["unsaved"]);
  });

  it("flush with nothing pending is a no-op", () => {
    const { saver, calls } = setup();
    saver.flush();
    expect(calls).toHaveLength(0);
  });
});
