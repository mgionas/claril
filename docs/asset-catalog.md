# Asset Catalog (Org-level CMDB)

A Jira-Assets/Insight-style library of **reusable typed objects with custom fields**, bound to diagram elements. Two jobs:
1. **Kill double-work** — define a service once, reference it across many diagrams.
2. **Ground the AI** — give the advisor/inspector real service semantics so analysis is fact-based, not guessed.

## Why it's a moat
EA repository + multi-notation diagramming + AI grounding, together. With the catalog, the AI stops "reading shapes" and starts understanding the system:
- *"This task calls **Payment Service**, but its catalog entry lists no **refund** capability — the 'Process Refund' branch has no valid service. Logic gap."*
- *"This step handles a **Data Object classified PII**, but the flow has no audit/approval — compliance risk."*
- *"**Ledger Service** SLA is 99.9% and this synchronous call blocks checkout — single point of failure."*

## Model
```
ObjectType   { id, orgId, name, icon, fieldSchema: [{ key, label, type, options?, required? }] }
Asset        { id, objectTypeId, name, fields: jsonb }      // values validated against fieldSchema
AssetRef     { fromAssetId, toAssetId, relationType }        // e.g. depends-on, owned-by, exposes
ElementBinding { diagramId, elementId, assetId }             // a shape references an asset
```

- **Custom-schema engine:** `fieldSchema` declares fields (text/number/select/reference/url/owner/tags). Validate `Asset.fields` with a **Zod schema derived at runtime** from `fieldSchema` (schema-on-read).
- **References** form a graph — a lightweight CMDB.
- **Bindings** connect a BPMN task / C4 component / sequence participant to a shared asset → cross-diagram traceability.

## Scope & phasing
- **Org-level** (shared across all projects — the single source of truth).
- **Phase A (with the AI advisor, P2):** ship **built-in object types** (Service, System, Data Object, Actor) + description to ground the AI fast.
- **Phase B (later):** full user-defined object types + custom fields + references + impact analysis.

## Capabilities enabled
- Single source of truth + consistency (glossary/repository).
- Impact analysis: "what diagrams/elements use asset X?" before you change it.
- AI grounding accessor: return an element's bound asset (+ refs) for prompt context.
