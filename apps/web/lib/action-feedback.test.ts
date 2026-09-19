import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOADING_TOAST_DELAY_MS,
  errorMessage,
  isNextControlError,
  runAction,
  type Notifier,
} from "@/lib/action-feedback";

function fakeNotifier() {
  return {
    loading: vi.fn(() => "t1"),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  } satisfies Notifier;
}

const later = <T,>(ms: number, value: T) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

describe("runAction", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("skips the loading toast for fast actions", async () => {
    const n = fakeNotifier();
    const p = runAction(() => later(100, 42), { loading: "Saving…", success: "Saved" }, n);
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).resolves.toBe(42);
    expect(n.loading).not.toHaveBeenCalled();
    expect(n.success).toHaveBeenCalledWith("Saved", { id: undefined });
  });

  it("shows loading after the delay, then replaces it with success", async () => {
    const n = fakeNotifier();
    const p = runAction(() => later(1000, "ok"), { loading: "Saving…", success: "Saved" }, n);
    await vi.advanceTimersByTimeAsync(LOADING_TOAST_DELAY_MS);
    expect(n.loading).toHaveBeenCalledWith("Saving…");
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toBe("ok");
    expect(n.success).toHaveBeenCalledWith("Saved", { id: "t1" });
  });

  it("dismisses a shown loading toast when there is no success message", async () => {
    const n = fakeNotifier();
    const p = runAction(() => later(1000, 1), { loading: "Working…" }, n);
    await vi.advanceTimersByTimeAsync(1000);
    await p;
    expect(n.dismiss).toHaveBeenCalledWith("t1");
    expect(n.success).not.toHaveBeenCalled();
  });

  it("reports errors and resolves undefined", async () => {
    const n = fakeNotifier();
    const p = runAction(() => Promise.reject(new Error("boom")), { error: "Could not save" }, n);
    await expect(p).resolves.toBeUndefined();
    expect(n.error).toHaveBeenCalledWith("Could not save", { id: undefined, description: "boom" });
  });

  it("rethrows Next redirect / not-found signals untouched", async () => {
    const n = fakeNotifier();
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/sign-in;307;",
    });
    await expect(runAction(() => Promise.reject(redirect), {}, n)).rejects.toBe(redirect);
    expect(n.error).not.toHaveBeenCalled();
  });
});

describe("isNextControlError", () => {
  it.each([
    [{ digest: "NEXT_REDIRECT;push;/x;307;" }, true],
    [{ digest: "NEXT_HTTP_ERROR_FALLBACK;404" }, true],
    [{ digest: "NEXT_NOT_FOUND" }, true],
    [new Error("nope"), false],
    [{ digest: 123 }, false],
    [null, false],
  ])("%o → %s", (err, expected) => {
    expect(isNextControlError(err)).toBe(expected);
  });
});

describe("errorMessage", () => {
  it("reads Error, string, and falls back", () => {
    expect(errorMessage(new Error("a"))).toBe("a");
    expect(errorMessage("b")).toBe("b");
    expect(errorMessage({})).toBe("Something went wrong.");
  });
});
