import type { ProcessGraph } from "@claril/logic-inspector";

/**
 * Deterministic, fast 32-bit hash (FNV-1a) of the graph's structural content
 * (ids, types, names, lanes/pools, sequence + message flows). Used to detect
 * when a cached synopsis is stale.
 */
export function graphHash(graph: ProcessGraph): string {
  const flowKey = (f: { sourceRef: string; targetRef: string; name?: string }) =>
    `${f.sourceRef}>${f.targetRef}|${f.name ?? ""}`;
  const canon =
    (graph.nodes ?? [])
      .map((n) => `${n.id}|${n.type}|${n.name ?? ""}|${n.lane ?? ""}|${n.pool ?? ""}`)
      .join(";") +
    "#" +
    (graph.flows ?? []).map(flowKey).join(";") +
    "#" +
    (graph.messageFlows ?? []).map(flowKey).join(";") +
    "#" +
    (graph.artifacts ?? []).map((a) => `${a.id}|${a.kind}|${a.name ?? ""}`).join(";");
  let h = 0x811c9dc5;
  for (let i = 0; i < canon.length; i++) {
    h ^= canon.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/**
 * A compact, deterministic process synopsis: pools/lanes (who does what),
 * element-type counts, decision points with branch labels, the sequence flow
 * order, cross-pool message flows, and a compact id↔name table (so `proposeEdit`
 * can target ids precisely). Much smaller than the full node+flow dump, while
 * giving the assistant a faithful picture of the WHOLE diagram.
 */
export function describeSynopsis(graph: ProcessGraph): string {
  const nodes = graph.nodes ?? [];
  const flows = graph.flows ?? [];
  const lanes = graph.lanes ?? [];
  const pools = graph.pools ?? [];
  const messageFlows = graph.messageFlows ?? [];
  const artifacts = graph.artifacts ?? [];

  const counts = new Map<string, number>();
  for (const n of nodes) counts.set(n.type, (counts.get(n.type) ?? 0) + 1);
  const countLine = [...counts.entries()].map(([t, n]) => `${n} ${t}`).join(", ") || "(empty)";

  const nameById = new Map(nodes.map((n) => [n.id, n.name ?? ""]));
  const label = (id: string) => nameById.get(id) || id;

  const poolsLanes =
    pools.length === 0 && lanes.length === 0
      ? "(none — a single, un-pooled process)"
      : [
          pools.length ? `Pools: ${pools.map((p) => p.name || p.id).join(", ")}` : "",
          ...lanes.map((l) => {
            const members = l.nodeIds.map(label).filter(Boolean).join(", ");
            return `- Lane "${l.name || l.id}"${l.pool ? ` (pool: ${l.pool})` : ""}: ${members || "(empty)"}`;
          }),
        ]
          .filter(Boolean)
          .join("\n");

  const gateways = nodes.filter((n) => /gateway/i.test(n.type));
  const decisions = gateways
    .map((g) => {
      const outs = flows
        .filter((f) => f.sourceRef === g.id)
        .map((f) => f.name || label(f.targetRef))
        .join(" | ");
      return `- ${g.name || g.id} (${g.type}) → ${outs || "(no branches)"}`;
    })
    .join("\n");

  const sequence = flows
    .map((f) => `${label(f.sourceRef)} → ${label(f.targetRef)}${f.name ? ` [${f.name}]` : ""}`)
    .join("\n");

  const messages = messageFlows
    .map((f) => `${label(f.sourceRef)} ⇢ ${label(f.targetRef)}${f.name ? ` [${f.name}]` : ""}`)
    .join("\n");

  const idTable = nodes
    .map((n) => {
      const name = n.name ? `"${n.name}"` : `(${n.type})`;
      return `${n.id} = ${name}${n.lane ? ` [lane: ${n.lane}]` : ""}`;
    })
    .join("\n");

  const blocks = [
    `PROCESS SHAPE: ${nodes.length} elements, ${flows.length} sequence flows${
      messageFlows.length ? `, ${messageFlows.length} message flows` : ""
    } — ${countLine}.`,
    "",
    "POOLS & LANES (who performs each step):",
    poolsLanes,
    "",
    "DECISION POINTS:",
    decisions || "(none)",
    "",
    "SEQUENCE FLOWS (process order):",
    sequence || "(none)",
  ];

  if (messageFlows.length > 0) {
    blocks.push("", "MESSAGE FLOWS (between pools):", messages);
  }

  if (artifacts.length > 0) {
    blocks.push(
      "",
      "DATA & ARTIFACTS:",
      artifacts.map((a) => `- ${a.id} [${a.kind}]${a.name ? ` "${a.name}"` : ""}`).join("\n"),
    );
  }

  blocks.push("", "ELEMENT ID ↔ NAME (use these ids for proposeEdit):", idTable || "(none)");

  return blocks.join("\n");
}
