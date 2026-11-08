// @vitest-environment jsdom
// buildServices maps toolbar actions onto real modeler services. The React
// render + overlay positioning are visual and verified later via
// Playwright/device — this file exercises only the testable seam.
import { describe, expect, it, vi } from "vitest";
import { buildServices } from "./canvas-selection-toolbar";

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
});
