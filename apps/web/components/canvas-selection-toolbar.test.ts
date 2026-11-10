// @vitest-environment jsdom
// buildServices maps toolbar actions onto real modeler services. The React
// render + overlay positioning are visual and verified later via
// Playwright/device — this file exercises only the testable seam.
import { describe, expect, it, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import {
  buildServices,
  CanvasSelectionToolbar,
  isAppendable,
} from "./canvas-selection-toolbar";

/** Minimal fake modeler: `get(name)` returns a spy-bearing stub per service. */
function fakeModeler() {
  const createdShape = { id: "new-shape" };
  const services = {
    elementFactory: { createShape: vi.fn(() => createdShape) },
    autoPlace: { append: vi.fn() },
    connect: { start: vi.fn() },
    directEditing: { activate: vi.fn() },
    modeling: { removeElements: vi.fn() },
  };
  const modeler = {
    get: (name: string) => (services as Record<string, unknown>)[name],
  };
  return { modeler, services, createdShape };
}

describe("buildServices", () => {
  const element = { id: "Task_1" };

  it("append() creates a bpmn:Task shape and auto-places it from the element", () => {
    const { modeler, services, createdShape } = fakeModeler();
    const toolbar = buildServices(modeler, element);
    toolbar.append();
    expect(services.elementFactory.createShape).toHaveBeenCalledWith({ type: "bpmn:Task" });
    expect(services.autoPlace.append).toHaveBeenCalledWith(element, createdShape);
  });

  it("connect() starts a connection from the element", () => {
    const { modeler, services } = fakeModeler();
    const toolbar = buildServices(modeler, element);
    toolbar.connect();
    expect(services.connect.start).toHaveBeenCalledTimes(1);
    const [, source] = services.connect.start.mock.calls[0];
    expect(source).toBe(element);
  });

  it("rename() activates direct editing on the element", () => {
    const { modeler, services } = fakeModeler();
    const toolbar = buildServices(modeler, element);
    toolbar.rename();
    expect(services.directEditing.activate).toHaveBeenCalledWith(element);
  });

  it("remove() removes the element via modeling", () => {
    const { modeler, services } = fakeModeler();
    const toolbar = buildServices(modeler, element);
    toolbar.remove();
    expect(services.modeling.removeElements).toHaveBeenCalledWith([element]);
  });

  it("more() dispatches a claril:open-context-menu event with the element id", () => {
    const { modeler } = fakeModeler();
    const toolbar = buildServices(modeler, element);
    const handler = vi.fn();
    window.addEventListener("claril:open-context-menu", handler);
    toolbar.more();
    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent<{ id: string }>;
    expect(event.detail.id).toBe("Task_1");
    window.removeEventListener("claril:open-context-menu", handler);
  });

  it("append() does not throw when autoPlace.append rejects the operation", () => {
    const { modeler, services } = fakeModeler();
    services.autoPlace.append.mockImplementation(() => {
      throw new Error("no rule for appending to this element");
    });
    const toolbar = buildServices(modeler, element);
    expect(() => toolbar.append()).not.toThrow();
  });

  it("connect() does not throw when connect.start rejects the operation", () => {
    const { modeler, services } = fakeModeler();
    services.connect.start.mockImplementation(() => {
      throw new Error("cannot start a connection from this element");
    });
    const toolbar = buildServices(modeler, element);
    expect(() => toolbar.connect()).not.toThrow();
  });

  it("rename() does not throw when directEditing.activate rejects the operation", () => {
    const { modeler, services } = fakeModeler();
    services.directEditing.activate.mockImplementation(() => {
      throw new Error("not directly editable");
    });
    const toolbar = buildServices(modeler, element);
    expect(() => toolbar.rename()).not.toThrow();
  });

  it("remove() does not throw when modeling.removeElements rejects the operation", () => {
    const { modeler, services } = fakeModeler();
    services.modeling.removeElements.mockImplementation(() => {
      throw new Error("cannot remove this element");
    });
    const toolbar = buildServices(modeler, element);
    expect(() => toolbar.remove()).not.toThrow();
  });

  it("more() does not throw when dispatchEvent itself fails", () => {
    const { modeler } = fakeModeler();
    const toolbar = buildServices(modeler, element);
    // Simulate a failure in the dispatch mechanism itself, rather than a
    // throwing listener — jsdom reports listener exceptions to the global
    // error handler on a separate path that a caller-side try/catch can't
    // observe, so that scenario isn't a useful proxy for "the action failed".
    const spy = vi.spyOn(window, "dispatchEvent").mockImplementation(() => {
      throw new Error("dispatch unavailable");
    });
    expect(() => toolbar.more()).not.toThrow();
    spy.mockRestore();
  });
});

describe("isAppendable", () => {
  it("is true for a plain shape (no waypoints)", () => {
    expect(isAppendable({ id: "Task_1" })).toBe(true);
  });

  it("is false for a connection (has a waypoints array)", () => {
    expect(isAppendable({ id: "Flow_1", waypoints: [{ x: 0, y: 0 }] })).toBe(false);
  });
});

describe("CanvasSelectionToolbar", () => {
  const services = {
    append: vi.fn(),
    connect: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(),
    more: vi.fn(),
  };

  function render(appendable?: boolean) {
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => {
      root.render(createElement(CanvasSelectionToolbar, { services, appendable }));
    });
    return { host, root };
  }

  it("shows append and connect buttons when appendable is true (default)", () => {
    const { host, root } = render();
    expect(host.querySelector('[aria-label="Add connected step"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Connect to…"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Rename"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Delete"]')).not.toBeNull();
    act(() => root.unmount());
  });

  it("hides append and connect buttons when appendable is false, keeps rename/delete/more", () => {
    const { host, root } = render(false);
    expect(host.querySelector('[aria-label="Add connected step"]')).toBeNull();
    expect(host.querySelector('[aria-label="Connect to…"]')).toBeNull();
    expect(host.querySelector('[aria-label="Rename"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Delete"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="More actions"]')).not.toBeNull();
    act(() => root.unmount());
  });
});
