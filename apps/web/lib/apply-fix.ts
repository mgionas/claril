import type { QuickFix } from "@claril/shared";

interface ModelerServices {
  get(name: string): any;
}

/**
 * Execute a declarative QuickFix against a bpmn-js modeler. All changes go
 * through `modeling` so they're a single, undoable command and trigger
 * re-inspection automatically.
 */
export function applyQuickFix(modeler: ModelerServices, fix: QuickFix): void {
  const elementRegistry = modeler.get("elementRegistry");
  const modeling = modeler.get("modeling");
  const elementFactory = modeler.get("elementFactory");

  switch (fix.kind) {
    case "removeElement": {
      const element = elementRegistry.get(fix.elementId);
      if (element) modeling.removeElements([element]);
      return;
    }
    case "appendEndEvent": {
      const element = elementRegistry.get(fix.elementId);
      if (!element) return;
      const end = elementFactory.createShape({ type: "bpmn:EndEvent" });
      modeler.get("autoPlace").append(element, end);
      return;
    }
    case "prependStartEvent": {
      const element = elementRegistry.get(fix.elementId);
      if (!element) return;
      const canvas = modeler.get("canvas");
      const start = elementFactory.createShape({ type: "bpmn:StartEvent" });
      const position = {
        x: (element.x ?? 0) - 120,
        y: (element.y ?? 0) + (element.height ?? 80) / 2,
      };
      const created = modeling.createShape(
        start,
        position,
        element.parent ?? canvas.getRootElement(),
      );
      modeling.connect(created, element);
      return;
    }
    default: {
      const exhaustive: never = fix;
      void exhaustive;
    }
  }
}
