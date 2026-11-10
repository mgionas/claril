// @vitest-environment jsdom
// Desktop-regression guard: proves the entire touch layer is inert for a
// fine/mouse pointer. Original plan called for a Playwright device-matrix
// test, but this repo has no Playwright and we're not adding it — instead
// every pure decision point the touch layer can make is exercised directly,
// plus the one stateful hook (useCoarsePointer), with a mocked fine-pointer
// matchMedia result. If any future change lets touch behavior leak onto
// desktop, one of these assertions flips.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { classifyPointer, isCoarsePointer, shouldRejectPalm } from "./pointer";
import { shouldStartConnect } from "./pencil-connect-module";
import { resolveLayout } from "./workbench-layout";
import { useCoarsePointer } from "@/hooks/use-coarse-pointer";

describe("desktop regression guard: touch layer is inert for fine pointers", () => {
  it("isCoarsePointer is false for a fine-pointer media query result", () => {
    expect(isCoarsePointer({ matches: false })).toBe(false);
  });

  it("classifyPointer treats mouse (and empty pointerType) as mouse", () => {
    expect(classifyPointer("mouse")).toBe("mouse");
    expect(classifyPointer("")).toBe("mouse");
  });

  it("shouldStartConnect never fires for a mouse press", () => {
    expect(shouldStartConnect("mouse", { id: "T1" })).toBe(false);
    expect(shouldStartConnect("", { id: "T1" })).toBe(false);
  });

  it("shouldRejectPalm never fires for mouse, even inside the palm window", () => {
    expect(shouldRejectPalm("mouse", 1000, 1100)).toBe(false);
  });

  it("resolveLayout keeps desktop viewports docked (wide)", () => {
    expect(resolveLayout({ width: 1440, orientation: "landscape" })).toBe("wide");
    expect(resolveLayout({ width: 1920, orientation: "landscape" })).toBe("wide");
  });

  describe("useCoarsePointer leaves no trace on a fine-pointer device", () => {
    let host: HTMLDivElement | null = null;
    let root: Root | null = null;
    // jsdom doesn't implement matchMedia at all, so there's nothing to
    // spyOn — assign the property directly and restore it after.
    const originalMatchMedia = window.matchMedia;

    afterEach(() => {
      if (root) {
        act(() => root!.unmount());
        root = null;
      }
      if (host) {
        host.remove();
        host = null;
      }
      window.matchMedia = originalMatchMedia;
      delete document.documentElement.dataset.coarse;
    });

    it("returns false and never stamps data-coarse on <html>", () => {
      // A fine-pointer (mouse) matchMedia("(pointer: coarse)") result:
      // matches is false, and it's a fully-formed MediaQueryList-shaped stub
      // so addEventListener/removeEventListener (used in the hook's cleanup)
      // are safe no-ops.
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }));

      // Ensure a prior test/run didn't leave the attribute set.
      delete document.documentElement.dataset.coarse;

      let latest: boolean | undefined;
      function Probe() {
        latest = useCoarsePointer();
        return null;
      }

      host = document.createElement("div");
      document.body.appendChild(host);
      root = createRoot(host);
      act(() => {
        root!.render(createElement(Probe));
      });

      expect(latest).toBe(false);
      expect(document.documentElement.dataset.coarse).toBeUndefined();
    });
  });
});
