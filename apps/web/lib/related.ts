export type RelationRow = {
  assetId: string;
  assetName: string;
  diagramId: string;
  diagramName: string;
  diagramKind: string;
  elementId: string;
};
export type RelatedGroup = {
  asset: { id: string; name: string };
  relatedDiagrams: { id: string; name: string; kind: string; elementIds: string[] }[];
};

/** Group binding rows by asset, excluding the source diagram; de-dup related
 * diagrams and collect their element ids. Assets with no related (non-source)
 * diagram are dropped. Pure. */
export function groupRelationsByAsset(rows: RelationRow[], sourceDiagramId: string): RelatedGroup[] {
  const byAsset = new Map<string, RelatedGroup>();
  for (const r of rows) {
    if (r.diagramId === sourceDiagramId) continue;
    let g = byAsset.get(r.assetId);
    if (!g) {
      g = { asset: { id: r.assetId, name: r.assetName }, relatedDiagrams: [] };
      byAsset.set(r.assetId, g);
    }
    let d = g.relatedDiagrams.find((x) => x.id === r.diagramId);
    if (!d) {
      d = { id: r.diagramId, name: r.diagramName, kind: r.diagramKind, elementIds: [] };
      g.relatedDiagrams.push(d);
    }
    if (!d.elementIds.includes(r.elementId)) d.elementIds.push(r.elementId);
  }
  return [...byAsset.values()];
}

/** Build the grounding prompt for the AI relation narrative. The model must
 * narrate ONLY the listed relations — never invent. Pure. */
export function buildRelationsPrompt(sourceName: string, groups: RelatedGroup[]): string {
  const lines = groups.map(
    (g) => `- ${g.asset.name}: also used in ${g.relatedDiagrams.map((d) => `"${d.name}" (${d.kind})`).join(", ")}`,
  );
  return [
    `The current diagram is "${sourceName}". Its catalog assets also appear in other diagrams:`,
    ...lines,
    "",
    "Write 2-3 sentences reminding the architect of these cross-diagram connections and why they might matter (shared services, consistency, impact). Mention ONLY the relationships listed above — do not invent any others. Be concise and concrete.",
  ].join("\n");
}
