# ADR 0001 — Foundational Decisions

- **Status:** Accepted
- **Date:** 2026-06-20

## Context
Bootstrapping Claril, an open-source architecture & process intelligence workbench for Solution Architects/Architects. These decisions were made during initial product strategy and are considered locked unless explicitly revisited.

## Decisions

1. **Product positioning** — an *intelligence* layer over modeling, not "another diagram tool". Wedge = deterministic logic inspector, then AI advisor.
2. **License: AGPL-3.0-only** — copyleft protects the hosted-service upside; CLA optional later for open-core.
3. **Delivery: web app + self-hostable on-prem.** docker-compose is the canonical artifact.
4. **Stack:** TypeScript monorepo (pnpm + Turborepo); Next.js 16; bpmn-js 18; Tailwind 4 + shadcn/ui; Better Auth; Drizzle + PostgreSQL; Vercel AI SDK 6. Always use **latest** stable versions.
5. **Editor engines per diagram type:** BPMN → bpmn-js (rejected Mermaid for BPMN — no BPMN object model/XML/analysis). Sequence → Mermaid/visual lib. C4 → LikeC4/Structurizr. A project holds typed diagrams freely; C4 is optional, never a forced hierarchy.
6. **Auth: Better Auth** (self-hosted in our Postgres; org plugin). Rejected Clerk (proprietary hosted SaaS breaks on-prem).
7. **DB: Neon ok for hosted/dev; depend only on standard `DATABASE_URL`** so on-prem uses vanilla Postgres.
8. **AI: brand-agnostic + BYOK**, behind our own `LLMProvider` (Vercel AI SDK). Keys org-level, encrypted. **Graceful degradation** — everything deterministic works with no key. Inbound providers + outbound MCP/REST analysis.
9. **Tenancy:** `Organization → Workspace → Project → Diagram → Version`. Org is foundational in V1 (Asset Catalog + AI keys live there); enterprise features (SSO/SCIM/billing) later. Roles: Org (Owner/Admin/Member), Workspace (Admin/Member), Project (Owner/Editor/Viewer); no 4th Reviewer role in V1.
10. **Asset Catalog** — org-level CMDB with custom object types/fields, asset references, and diagram-element bindings; grounds the AI. Built-in types first, full custom schemas later.
11. **Design:** Linear/Vercel minimal, dark-first, electric blue `#4D8DFF`; canvas-maximal floating layout; theme the bpmn-js SVG to match.

## Consequences
- The deterministic inspector is the first real engineering investment (framework-free package).
- Self-host constraints forbid proprietary cloud dependencies in core.
- The product spans three notations + a catalog, so "MVP" is sequenced carefully (see roadmap.md).
