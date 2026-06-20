/**
 * Asset Catalog grounding for the advisor.
 *
 * The catalog (org-level CMDB) gives the advisor *real* service semantics
 * instead of shape names. This module defines a compact, dependency-free
 * representation of an element's bound assets (and their references) plus a
 * serializer the prompt builder can splice in. The web app maps its DB rows
 * into {@link AssetContext} so this package stays free of any DB import.
 */

/** A single custom-field value on a grounded asset. */
export interface GroundedField {
  label: string;
  value: string;
}

/** One asset bound to a diagram element, flattened for prompting. */
export interface GroundedAsset {
  /** The bpmn element id this asset is bound to (omit for org-wide context). */
  elementId?: string;
  typeName: string;
  name: string;
  description?: string;
  fields: GroundedField[];
  /** Typed references to other assets, e.g. "depends-on Ledger Service". */
  references?: { relationType: string; targetName: string }[];
}

/** The asset context passed alongside a process graph to the advisor. */
export interface AssetContext {
  assets: GroundedAsset[];
}

/** Render the asset context as a compact prompt block. */
export function describeAssetContext(ctx: AssetContext | undefined): string {
  if (!ctx || ctx.assets.length === 0) return "(no bound assets)";
  return ctx.assets
    .map((a) => {
      const head = `- ${a.elementId ? `@${a.elementId} ` : ""}${a.typeName} "${a.name}"`;
      const lines: string[] = [head];
      if (a.description) lines.push(`    ${a.description}`);
      for (const f of a.fields) {
        if (f.value) lines.push(`    ${f.label}: ${f.value}`);
      }
      for (const r of a.references ?? []) {
        lines.push(`    ${r.relationType} -> ${r.targetName}`);
      }
      return lines.join("\n");
    })
    .join("\n");
}
