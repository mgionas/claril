import { diff } from "bpmn-js-differ";
import { BpmnModdle } from "bpmn-moddle";

/**
 * Semantic BPMN diff helpers (client-side). Wraps `bpmn-js-differ` +
 * `bpmn-moddle` into a flat, render-friendly result used by the Versions
 * panel's visual diff and by the canvas diff overlay.
 *
 * "before" = the selected older version's XML; "after" = the current XML.
 */

export type DiffKind = "added" | "removed" | "changed" | "layout";

export interface DiffEntry {
  /** BPMN element id (key in the differ result). */
  elementId: string;
  /** e.g. "bpmn:Task" → "Task" for display. */
  type: string;
  /** Element name/label if present. */
  name?: string;
  kind: DiffKind;
  /** For `changed`: the attributes that differ (name → old/new). */
  attrs?: { attr: string; oldValue: string; newValue: string }[];
}

export interface DiffSummary {
  added: number;
  removed: number;
  changed: number;
  layout: number;
}

export interface BpmnDiffResult {
  entries: DiffEntry[];
  summary: DiffSummary;
  /** Element ids by bucket — used to color the canvas overlay. */
  added: string[];
  removed: string[];
  changed: string[];
  layout: string[];
}

/** The four element-id buckets the canvas colors for a diff. */
export type DiffMarks = Pick<BpmnDiffResult, "added" | "removed" | "changed" | "layout">;

function shortType(t: string | undefined): string {
  if (!t) return "Element";
  const i = t.indexOf(":");
  return i >= 0 ? t.slice(i + 1) : t;
}

function stringify(v: unknown): string {
  if (v === undefined || v === null) return "—";
  if (typeof v === "string") return v.length ? v : "—";
  if (typeof v === "object") {
    const o = v as { id?: string; $type?: string };
    return o.id ?? o.$type ?? "[object]";
  }
  return String(v);
}

async function toDefinitions(xml: string): Promise<unknown> {
  const moddle = new BpmnModdle();
  const { rootElement } = await moddle.fromXML(xml);
  return rootElement;
}

/**
 * Compute the semantic diff between two BPMN XML documents. Returns a flat list
 * of entries plus per-bucket id arrays. Throws if either document is unparsable.
 */
export async function computeBpmnDiff(
  beforeXml: string,
  afterXml: string,
): Promise<BpmnDiffResult> {
  const [before, after] = await Promise.all([toDefinitions(beforeXml), toDefinitions(afterXml)]);
  const result = diff(before, after);

  const entries: DiffEntry[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  const layout: string[] = [];

  for (const [id, el] of Object.entries(result._added)) {
    added.push(id);
    entries.push({
      elementId: id,
      type: shortType(el.$type),
      name: typeof el.name === "string" ? el.name : undefined,
      kind: "added",
    });
  }
  for (const [id, el] of Object.entries(result._removed)) {
    removed.push(id);
    entries.push({
      elementId: id,
      type: shortType(el.$type),
      name: typeof el.name === "string" ? el.name : undefined,
      kind: "removed",
    });
  }
  for (const [id, entry] of Object.entries(result._changed)) {
    changed.push(id);
    const attrs = Object.entries(entry.attrs).map(([attr, { oldValue, newValue }]) => ({
      attr,
      oldValue: stringify(oldValue),
      newValue: stringify(newValue),
    }));
    entries.push({
      elementId: id,
      type: shortType(entry.model.$type),
      name: typeof entry.model.name === "string" ? entry.model.name : undefined,
      kind: "changed",
      attrs,
    });
  }
  for (const [id, el] of Object.entries(result._layoutChanged)) {
    // An element can be both attr- and layout-changed; only add a layout row if
    // it isn't already covered by a content change.
    if (changed.includes(id)) continue;
    layout.push(id);
    entries.push({
      elementId: id,
      type: shortType(el.$type),
      name: typeof el.name === "string" ? el.name : undefined,
      kind: "layout",
    });
  }

  return {
    entries,
    added,
    removed,
    changed,
    layout,
    summary: {
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      layout: layout.length,
    },
  };
}
