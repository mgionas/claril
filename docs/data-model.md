# Data Model & Tenancy

## Hierarchy (canonical)
```
Organization                    tenant root
  ├ members          (org roles: Owner / Admin / Member)
  ├ Asset Catalog    (shared SSOT — see asset-catalog.md)
  ├ AI keys (BYOK)   (provider config, encrypted)
  ├ settings / billing(later) / SSO-SCIM(later)
  └ Workspace / Team
       ├ team members (workspace roles: Admin / Member)
       └ Project
            ├ roles: Owner / Editor / Viewer
            └ Diagram   (type: bpmn | sequence | c4)
                 └ Version
```

Solo signup auto-creates a personal Org + default Workspace; the user is Owner throughout. The Org tier is **foundational in V1** (because the Asset Catalog is org-level); Org *enterprise features* (SSO/SCIM, billing) come later.

## Where things live
| Concern | Tier |
|---|---|
| Asset Catalog, custom object types, AI keys, billing, SSO | **Organization** |
| Team grouping & membership | **Workspace** |
| Diagrams, versions, comments, per-user edit roles | **Project** |

## Roles & permissions
Three tiers; **effective permission = most permissive inherited**.

| | Org Owner/Admin | WS Admin | Project Owner | Editor | Viewer |
|---|:--:|:--:|:--:|:--:|:--:|
| View / export / comment | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create / edit diagrams + versions | ✅ | ✅ | ✅ | ✅ | ❌ |
| Run AI advisor / inspector | ✅ | ✅ | ✅ | ✅ | 👁 results |
| Manage project members & roles | ✅ | ✅ | ✅ | ❌ | ❌ |
| Manage workspaces / teams | ✅ | ✅ | ❌ | ❌ | ❌ |
| Asset Catalog, AI keys, org settings | ✅ | ❌ | ❌ | ❌ | ❌ |

> Decision: **no 4th "Reviewer" role** in V1 — Viewer covers view+comment for stakeholders.

## Core entities (Drizzle)
- `organization`, `member` (org), `workspace`, `workspaceMember`, `project`, `projectMember`
- `diagram { id, projectId, type, name, content (BPMN XML / text), ... }`
- `version { id, diagramId, content, label, createdBy, createdAt }`
- `comment { id, diagramId, elementId?, body, authorId, ... }`
- Asset Catalog: `objectType`, `asset`, `assetRef`, `elementBinding` (see asset-catalog.md)
- `aiProviderConfig { orgId, provider, model, baseUrl, encryptedKey }`
- Better Auth tables via its Drizzle adapter (don't hand-roll identity)

## Diagrams are free-form
A Project holds typed, first-class diagrams created in any order. **C4 is an optional diagram type / optional scaffold template, never a mandatory hierarchy** — a user can start directly from a sequence diagram. Future: cross-diagram linking/traceability via shared Asset Catalog assets.

## Conventions
- Tenancy columns (`orgId`, `workspaceId`, `projectId`) indexed; foreign keys indexed.
- Custom asset fields and diagram payloads use `jsonb`/`text`. Validate `jsonb` with Zod at the boundary.
- All migrations reversible.
