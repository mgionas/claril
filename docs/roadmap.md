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

**P0–P2 gaps — all closed**
- [x] **G1 — Self-host**: `Dockerfile` (standalone, 193MB) + `docker-compose.yml` (web + migrate + postgres) + `docs/self-hosting.md` (W5)
- [x] **G2 — CLI / MCP lint mode**: `@claril/bpmn-parse` (headless) + `claril lint`/`claril mcp` with CI exit codes + `lint_bpmn` MCP tool (W2)
- [x] **G3 — Built-in Asset Catalog**: org-scoped `asset_type`/`asset`/`asset_link`/`element_asset_binding` + custom-field engine + `/catalog` admin + in-canvas element→asset binding + advisor grounding (W3 + binding follow-up)
- [x] **G4 — doc-gen + Q&A** advisor modes: `generateProcessDoc` + `answerQuestion`, command-bar Q&A + Docs panel (W6)
- [x] **G5 — Multi-diagram navigation**: projects → diagrams dashboard, per-diagram `/d/[id]` route, authorized CRUD (W1)

> The logic-inspector was built early because it's pure TS, framework-free, and the
> product's core IP. With G1–G5 closed and deployed, the moat is independently
> shippable (CLI/MCP), the app is usable across many diagrams, and the catalog
> differentiation layer is live. Next: P3 depth (versioning, more notations).

## Next plan — workstreams

Mapped to the agent team so they can run in parallel where independent.

| ID | Workstream | Agent | Status |
|----|-----------|-------|--------|
| **W1** | Multi-diagram navigation + project/diagram CRUD (G5) | `ui-engineer` | ✅ shipped |
| **W2** | CLI + MCP lint server over the inspector (G2) | `backend-engineer` | ✅ shipped |
| **W3** | Asset Catalog foundation: schema, CRUD, element binding (G3) | `catalog-engineer` | ✅ shipped (+ canvas binding) |
| **W4** | Versioning: named versions, list, restore, visual diff (P3) | `db-architect` + `canvas-engineer` | 🔄 in progress |
| **W5** | Self-host: Dockerfile + docker-compose (G1) | `backend-engineer` | ✅ shipped |
| **W6** | Advisor doc-gen + Q&A modes (G4) | `ai-advisor-engineer` | ✅ shipped |
| **W7** | Sequence + C4 editors (P3) | `canvas-engineer` | 🔄 in progress |
| **W8** | Provider connect: guided AI-setup wizard (steps/animation/instructions) + Vercel AI Gateway + BYOK + optional Google OAuth→Vertex | `ai-advisor-engineer` + `ui-engineer` | queued |
| **W9** | AI drawer redesign: tabbed Chat + Problems, sent/received bubbles, specialized proposal cards, progressive phases, markdown doc viewer + DB persistence + Regenerate, token usage (Settings + chat) | `ui-engineer` + `ai-advisor-engineer` | ✅ merged to `main` (deployed) |
| **W10** | History & review batch — **F1** History (auto-versioning + top-bar dropdown, replaces archive), **F2** AI-edit review (on-board marks + Approve/Roll back/Keep refining), **F3** chat memory + DB knowledge cache + token cut + surrogate sanitize | `ui-engineer` + `canvas-engineer` + `db-architect` | 🔄 **F1 deployed to `main`**; **F2 + F3 built** (branch `feat/ai-review-chat-memory`, reviewed green; migrations 0006–0008 applied) — pending merge + live smoke test |

Consumer chat subscriptions (ChatGPT/Claude/Gemini) cannot power third-party API
inference (separate billing, no sanctioned OAuth) — W8 uses AI Gateway / BYOK /
Vertex OAuth instead.

### W10 — History & review batch (F-tasks)

Spec: `docs/superpowers/specs/2026-06-20-history-ai-review-chat-memory-design.md`. Built in order F1 → F2 → F3, each its own plan.

**F1 — History** (auto-versioning + top-bar dropdown, replaces Archive). Plan: `docs/superpowers/plans/2026-06-20-f1-history.md`. Status: **built, reviewed green; pending live smoke test.**
- [x] F1.1 — Revert diagram-archive (top-bar button, dashboard section, actions, `listProjects` filter); `archivedAt` column kept dormant
- [x] F1.2 — `version.source` column (`manual|auto|ai|import|restore`) + migration 0006 (**applied to Neon**)
- [x] F1.3 — `source` server actions + `autosnapshotVersion` (no-op-guarded insert from client XML)
- [x] F1.4 — Smart-throttled auto-versioning coalescer (10s idle / 2min cap) + workbench wiring + force-snapshot on AI apply (unit-tested)
- [x] F1.5 — `history-menu.tsx` dropdown (Popover + ScrollArea timeline, source badges, Diff + Restore)
- [x] F1.6 — Wire History into top-bar (before Settings); remove `VersionsPanel` + right-edge toggle; share `DiffMarks` type
- [ ] F1.7 — Manual smoke test (auto/AI/import/restore badges; diff colors + clears; restore reload; dashboard has no Archived)

**F2 — AI-edit review** (mark on board + Approve / Roll back / Keep refining). No DB change. Plan: `docs/superpowers/plans/2026-06-20-f2-ai-edit-review.md`. Status: **built, reviewed green; pending live smoke test.**
- [x] F2.1 — Distinct on-board marking for AI-applied elements (violet `.claril-ai-edit` + glow); parallel `markAiEdit`/`clearAiEdit` canvas API, independent of version-diff marks
- [x] F2.2 — ProposalCard actions → **Approve** (clear marks, snapshot `ai` via F1 forceSnapshot), **Roll back** (revert `preEditXml`, clear marks), **Keep refining** (focus composer)
- [x] F2.3 — Pending-state UX ("Applied to canvas — review:"); review state keyed by `toolCallId` (only the active proposal actionable); `busy`-gated; `focusComposer` on the chat handle
- [ ] F2.4 — Manual smoke test (violet marks; Approve→AI version; Roll back reverts; Keep refining focuses composer; coexists with History diff) — needs AI provider

**F3 — Chat memory + token cut** (persist chat + DB knowledge cache + surrogate sanitize). DB: `chat_message` (0007), `diagram_knowledge` (0008) — both applied. Plan: `docs/superpowers/plans/2026-06-20-f3-chat-memory-knowledge.md`. Status: **built, reviewed green; pending live smoke test.**
- [x] F3.1 — Surrogate sanitizer (`stripLoneSurrogates`) on grounding + message text before `streamText` — **fixes the live `400 invalid high surrogate`**
- [x] F3.2 — `chat_message` table (0007) + `appendChatMessages`/`getChatMessages`/`clearChat`; hydrate `useChat({messages})` on reload; Clear chip; `seenProposals` seeded from history so hydrated proposals don't re-apply
- [x] F3.3 — `diagram_knowledge` table (0008): cached compact synopsis (shape + decisions + sequence flows + id↔name) keyed by `graphHash`; chat route grounds on synopsis + findings + assets instead of the full dump (`proposeEdit` still gets the full graph)
- [ ] F3.4 — Manual smoke test (reload restores chat; Clear; emoji no 400; compact grounding; proposeEdit precision; synopsis regen on graph change) — needs AI provider

### Remaining W3 tails (follow-ups)
- [ ] Asset-link management UI + impact/usage panel (actions exist: `createAssetLink`, `getAssetUsage`)
- [ ] Reference-field picker (engine supports `reference`; editor treats it as text)
- [ ] F1 cleanup: `createDiagramVersion` is now callerless (kept as manual-snapshot API) — remove or wire to a "Save named version" control
