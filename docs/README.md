# Claril Documentation

The knowledge base for **Claril** — an open-source, self-hostable architecture & process intelligence workbench for Solution Architects and Architects.

## Index

| Doc | What's in it |
|---|---|
| [vision.md](./vision.md) | Positioning, the wedge, who it's for, what makes it different |
| [architecture.md](./architecture.md) | Stack, monorepo layout, deployment, AI integration model |
| [data-model.md](./data-model.md) | Tenancy (Org→Workspace→Project→Diagram→Version), roles, entities |
| [diagram-kinds.md](./diagram-kinds.md) | Supported diagram kinds (BPMN / Sequence / C4) and their editors |
| [asset-catalog.md](./asset-catalog.md) | The org-level CMDB: object types, custom fields, bindings, AI grounding |
| [ai-and-inspector.md](./ai-and-inspector.md) | Logic inspector (deterministic) + AI advisor + the 3-tier AI model |
| [design-system.md](./design-system.md) | Linear-minimal dark aesthetic, tokens, canvas-maximal layout, canvas theming |
| [roadmap.md](./roadmap.md) | Phased delivery plan (P0–P5) and current P0 task breakdown |
| [decisions/](./decisions/) | Architecture Decision Records (ADRs) |

## TL;DR

> Every BPMN tool gives you a canvas. Claril *understands* the process — a deterministic logic inspector catches structural defects, an AI advisor (brand-agnostic, BYOK) critiques the design, and an organization-level Asset Catalog means you define a service once and the whole system understands it. **It's fully useful with zero AI configured; AI is an amplifier, never a gate.**

## Core invariants (don't break these)

1. **Deterministic-first.** The logic inspector and all core features work with no AI key.
2. **Brand-agnostic + BYOK.** Any LLM provider (incl. local Ollama); keys are user-supplied, org-level, encrypted.
3. **Self-hostable.** Runs entirely in your own infra; depends only on standard Postgres (`DATABASE_URL`). No proprietary cloud lock-in.
4. **BPMN XML is the source of truth.** Diffable, exportable, interoperable.
5. **Latest stable libraries.** Verify with `npm view` before pinning.
6. **AGPL-3.0.** Copyleft protects the hosted-service upside.
