// Ambient declarations for the (untyped) BPMN diffing packages used by the
// versioning visual-diff feature. bpmn-js-differ + bpmn-moddle ship no types.

declare module "bpmn-js-differ" {
  /** A semantic-model element (bpmn-moddle object). Minimal shape we rely on. */
  interface DiffElement {
    $type: string;
    id?: string;
    name?: string;
    [key: string]: unknown;
  }

  interface ChangedEntry {
    model: DiffElement;
    attrs: Record<string, { oldValue: unknown; newValue: unknown }>;
  }

  /** Result of {@link diff}: keyed by element id. */
  interface DiffResult {
    _added: Record<string, DiffElement>;
    _removed: Record<string, DiffElement>;
    _changed: Record<string, ChangedEntry>;
    _layoutChanged: Record<string, DiffElement>;
  }

  // The two definitions are bpmn-moddle root elements (bpmn:Definitions).
  export function diff(oldDefinitions: unknown, newDefinitions: unknown): DiffResult;

  // Re-exported by the package; not used directly here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const Differ: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const ChangeHandler: any;
}

declare module "bpmn-moddle" {
  interface FromXMLResult {
    rootElement: unknown;
    references: unknown[];
    warnings: unknown[];
    elementsById: Record<string, unknown>;
  }

  /** Minimal surface of the BpmnModdle class (named export in dist). */
  export class BpmnModdle {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(options?: any);
    fromXML(xml: string, typeName?: string): Promise<FromXMLResult>;
  }
}
