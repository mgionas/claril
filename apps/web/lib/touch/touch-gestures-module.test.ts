// @vitest-environment jsdom
// This file uses `document`/`TouchEvent` to drive the DOM listeners directly,
// unlike the rest of the web app's tests (default environment: node).
import { describe, expect, it, vi } from "vitest";
import { TouchGestures } from "./touch-gestures-module";

function fakeCanvas() {
  const container = document.createElement("div");
  // jsdom gives 0-rects; stub getBoundingClientRect to the origin.
  container.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;
  return {
    container,
    zoom: vi.fn(() => 1), // argless returns current scale
    scroll: vi.fn(),
    getContainer: () => container,
  };
}

const touch = (id: number, x: number, y: number) =>
  ({ identifier: id, clientX: x, clientY: y }) as Touch;
const tevent = (type: string, touches: Touch[]) =>
  new TouchEvent(type, { touches, cancelable: true });

describe("TouchGestures", () => {
  it("two-finger move drives canvas.zoom with a scale and center", () => {
    const canvas = fakeCanvas();
    new TouchGestures(canvas as never);
    canvas.container.dispatchEvent(tevent("touchstart", [touch(1, 0, 0), touch(2, 100, 0)]));
    canvas.container.dispatchEvent(tevent("touchmove", [touch(1, -50, 0), touch(2, 150, 0)]));
    expect(canvas.zoom).toHaveBeenCalledWith(expect.closeTo(2, 1), { x: 50, y: 0 });
  });

  it("ignores single-finger touches (lets diagram-js handle them)", () => {
    const canvas = fakeCanvas();
    new TouchGestures(canvas as never);
    canvas.container.dispatchEvent(tevent("touchstart", [touch(1, 10, 10)]));
    canvas.container.dispatchEvent(tevent("touchmove", [touch(1, 20, 20)]));
    expect(canvas.zoom).not.toHaveBeenCalledWith(expect.anything(), expect.anything());
    expect(canvas.scroll).not.toHaveBeenCalled();
  });
});
