import type { ProcessGraph } from "@claril/logic-inspector";

/**
 * Deterministic, fast 32-bit hash (FNV-1a) of the graph's structural content
 * (ids, types, names, flows). Used to detect when a cached synopsis is stale.
 */
export function graphHash(graph: ProcessGraph): string {
  const canon =
    (graph.nodes ?? [])
      .map((n) => `${n.id}|${n.type}|${n.name ?? ""}`)
      .join(";") +
    "#" +
    (graph.flows ?? [])
      .map((f) => `${f.sourceRef}>${f.targetRef}|${f.name ?? ""}`)
      .join(";");
  let h = 0x811c9dc5;
  for (let i = 0; i < canon.length; i++) {
    h ^= canon.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/**
 * A compact, deterministic process synopsis: element-type counts, the decision
 * points (gateways) with their outgoing branch labels, and a compact id↔name
 * table for every element (so `proposeEdit` can still target ids precisely).
 * Much smaller than the full node+flow dump, while preserving the facts the
 * assistant needs to answer and to propose edits.
 */
export function describeSynopsis(graph: ProcessGraph): string {
  const nodes = graph.nodes ?? [];
  const flows = graph.flows ?? [];

  const counts = new Map<string, number>();
  for (const n of nodes) counts.set(n.type, (counts.get(n.type) ?? 0) + 1);
  const countLine = [...counts.entries()].map(([t, n]) => `${n} ${t}`).join(", ") || "(empty)";

  const nameById = new Map(nodes.map((n) => [n.id, n.name ?? ""]));
  const gateways = nodes.filter((n) => /gateway/i.test(n.type));
  const decisions = gateways
    .map((g) => {
      const outs = flows
        .filter((f) => f.sourceRef === g.id)
        .map((f) => f.name || nameById.get(f.targetRef) || f.targetRef)
        .join(" | ");
      return `- ${g.name || g.id} (${g.type}) → ${outs || "(no branches)"}`;
    })
    .join("\n");

  const idTable = nodes
    .map((n) => `${n.id} = ${n.name ? `"${n.name}"` : `(${n.type})`}`)
    .join("\n");

  const sequence = flows
    .map((f) => {
      const src = nameById.get(f.sourceRef) || f.sourceRef;
      const tgt = nameById.get(f.targetRef) || f.targetRef;
      return `${src} → ${tgt}${f.name ? ` [${f.name}]` : ""}`;
    })
    .join("\n");

  return [
    `PROCESS SHAPE: ${nodes.length} elements, ${flows.length} flows — ${countLine}.`,
    "",
    "DECISION POINTS:",
    decisions || "(none)",
    "",
    "SEQUENCE FLOWS (process order):",
    sequence || "(none)",
    "",
    "ELEMENT ID ↔ NAME (use these ids for proposeEdit):",
    idTable || "(none)",
  ].join("\n");
}
