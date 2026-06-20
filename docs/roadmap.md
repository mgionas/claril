# Roadmap

Sequencing principle: **prove the moat (deterministic inspector on a beautiful canvas) before the expensive collaboration plumbing.** Each phase is independently shippable.

## P0 — Foundation
Monorepo (pnpm + Turborepo) · Next.js 16 app shell with the canvas-maximal layout · bpmn-js canvas with themed rendering · BPMN XML import/export · save/load to Postgres (Drizzle) · Better Auth (org/workspace/project + roles) · docker-compose.
**Outcome:** draw, save, reopen a themed BPMN diagram, self-hosted, with auth and tenancy.

## P1 — Logic Inspector ★ (the wedge)
`packages/logic-inspector`: graph model + structural rules + best-practice rules · live findings panel with fly-to + quick-fixes · **CLI / MCP lint mode**.
**Outcome:** the thing nobody else does well — releasable on its own.

## P2 — AI Advisor + built-in Asset Catalog
`packages/ai-advisor` (Vercel AI SDK, `LLMProvider`, BYOK, Ollama) · advisor grounded on findings · doc-gen · Q&A · **built-in asset types** to ground the AI · the 3-tier UX (status pill, ✦ badges).
**Outcome:** the "AI architecture tool" story is real — and it degrades gracefully to T1.

## P3 — Versioning & multi-diagram
Named versions · visual diff (bpmn-js-differ) · restore · **Sequence** and **C4** editors alongside BPMN in a project · cross-diagram element binding to catalog assets.
**Outcome:** trustworthy for real architecture work across notations.

## P4 — Team & collaboration
Full RBAC polish · comments/@mentions · review workflow · **real-time multiplayer (Yjs + Hocuspocus)** · org enterprise features begin (SSO/SCIM).
**Outcome:** delivers the team-support goal; enterprise-ready foundations.

## P5 — Platform & ecosystem
Full **Asset Catalog** (user-defined object types + custom fields + references + impact analysis) · DMN decision tables · simulation (token-flow, bottleneck) · executable export (Zeebe/Flowable) · plugin SDK · integrations (Jira/Confluence, Git).
**Outcome:** a platform, not just a tool.

---

## Current status (2026-06-20)

P0–P2 core is built and **deployed to production on Vercel** (root dir `apps/web`). The
canvas has had a full UX pass (custom palette, grouped right-click menu, in-flow
push Inspector drawer, connect handles, finding overlays + "View problem" → drawer).

**Done**
- [x] Repo, license, README, docs, agent team, Archmantic manifest
- [x] Monorepo: pnpm-workspace, turbo.json, base tsconfig, eslint/prettier
- [x] `packages/shared` (types + zod), `packages/logic-inspector` (engine + 14 tests)
- [x] `apps/web`: Next.js 16 + Tailwind 4 baseline, dark theme tokens
- [x] bpmn-js canvas: themed rendering + import/export + UX polish
- [x] `packages/db`: Drizzle schema (org→workspace→project→diagram→version) + migrations (Neon)
- [x] Better Auth wiring (org plugin) + sign-in/sign-up
- [x] Save/load diagram to Postgres (server actions, debounced autosave)
- [x] P1 inspector: structural + best-practice rules, fly-to, executable quick-fixes
- [x] P2 ai-advisor: `LLMProvider` (Vercel AI SDK), BYOK, advisor grounded on findings; 3-tier UX
- [x] Production deploy on Vercel

**Open gaps inside P0–P2 (close before/alongside P3)**
- [ ] **G1 — Self-host**: `Dockerfile` (standalone) + `docker-compose.yml` (web + postgres) — P0 outcome
- [ ] **G2 — CLI / MCP lint mode**: standalone `claril lint <file.bpmn>` + MCP server exposing the inspector — P1 wedge, releasable on its own
- [ ] **G3 — Built-in Asset Catalog (foundation)**: asset types + assets + element→asset binding; feed metadata to the advisor — P2 grounding
- [ ] **G4 — doc-gen + Q&A** advisor modes (advisor critique exists; generation/Q&A pending)

**App-usability gap (lands with P3)**
- [ ] **G5 — Multi-diagram navigation**: projects → diagrams list, create/rename/delete, route per diagram (today the app opens a single default workbench)

> The logic-inspector was built early because it's pure TS, framework-free, and the
> product's core IP. The next push is to (a) make the moat independently shippable
> (G2), (b) make the app usable across many diagrams (G5), and (c) start the
> differentiation layer (G3). See "Next plan" below.

## Next plan — workstreams

Mapped to the agent team so they can run in parallel where independent.

| ID | Workstream | Agent | Depends on |
|----|-----------|-------|-----------|
| **W1** | Multi-diagram navigation + project/diagram CRUD (G5) | `ui-engineer` + `backend-engineer` | — |
| **W2** | CLI + MCP lint server over the inspector (G2) | `backend-engineer` (+ `inspector-engineer` for API surface) | — |
| **W3** | Asset Catalog foundation: schema, CRUD, element binding (G3) | `db-architect` → `catalog-engineer` | — |
| **W4** | Versioning: named versions, list, restore, visual diff (P3) | `db-architect` + `canvas-engineer` | W1 |
| **W5** | Self-host: Dockerfile + docker-compose (G1) | `backend-engineer` | — |
| **W6** | Advisor doc-gen + Q&A modes (G4) | `ai-advisor-engineer` | — |
| **W7** | Sequence + C4 editors (P3) | `canvas-engineer` | W1 |

W1, W2, W3, W5, W6 have no cross-dependencies and can start immediately and concurrently.
