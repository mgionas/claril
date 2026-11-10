import { describe, expect, it } from "vitest";
import { buildRelationsPrompt, groupRelationsByAsset, type RelationRow } from "./related";

const rows: RelationRow[] = [
  { assetId: "A", assetName: "Payment Service", diagramId: "SRC", diagramName: "Checkout BPMN", diagramKind: "bpmn", elementId: "e1" },
  { assetId: "A", assetName: "Payment Service", diagramId: "C4", diagramName: "Billing", diagramKind: "c4", elementId: "c1" },
  { assetId: "A", assetName: "Payment Service", diagramId: "C4", diagramName: "Billing", diagramKind: "c4", elementId: "c2" },
  { assetId: "B", assetName: "User Mgmt", diagramId: "SEQ", diagramName: "Login", diagramKind: "sequence", elementId: "s1" },
];

describe("groupRelationsByAsset", () => {
  it("groups by asset, excludes the source diagram, de-dups diagrams + collects elementIds", () => {
    const g = groupRelationsByAsset(rows, "SRC");
    const payment = g.find((x) => x.asset.id === "A")!;
    expect(payment.relatedDiagrams).toEqual([{ id: "C4", name: "Billing", kind: "c4", elementIds: ["c1", "c2"] }]);
  });
  it("drops assets whose only binding is the source diagram", () => {
    const g = groupRelationsByAsset(rows.filter((r) => r.assetId === "A" && r.diagramId === "SRC"), "SRC");
    expect(g).toEqual([]);
  });
  it("includes assets bound only in other diagrams (asset B)", () => {
    const g = groupRelationsByAsset(rows, "SRC");
    expect(g.find((x) => x.asset.id === "B")?.relatedDiagrams[0].id).toBe("SEQ");
  });
});

describe("buildRelationsPrompt", () => {
  it("buildRelationsPrompt lists only the given relations (no invention)", () => {
    const p = buildRelationsPrompt("Checkout BPMN", [
      { asset: { id: "A", name: "Payment Service" }, relatedDiagrams: [{ id: "C4", name: "Billing", kind: "c4", elementIds: ["c1"] }] },
    ]);
    expect(p).toContain("Checkout BPMN");
    expect(p).toContain("Payment Service");
    expect(p).toContain("Billing");
    expect(p).toContain("c4");
    expect(p.toLowerCase()).toContain("only the relationships listed"); // grounding guard phrase
  });
});
