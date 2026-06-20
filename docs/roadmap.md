# Roadmap

Sequencing principle: **prove the moat (deterministic inspector on a beautiful canvas) before the expensive collaboration plumbing.** Each phase is independently shippable.

## Phases (north star)

- **P0 — Foundation** · monorepo, Next.js 16 app shell, themed bpmn-js canvas, BPMN import/export, Postgres (Drizzle), Better Auth (org→workspace→project), docker-compose. **✅ shipped**
- **P1 — Logic Inspector ★** · graph model + structural/best-practice rules, findings panel (fly-to + quick-fixes), CLI/MCP lint mode. **✅ shipped**
- **P2 — AI Advisor + Asset Catalog** · provider-agnostic BYOK `LLMProvider`, advisor grounded on findings, doc-gen, built-in asset types, 3-tier UX. **✅ shipped** — since matured into a full AI **co-editor** (see W9–W11).
- **P3 — Versioning & multi-diagram** · named/auto versions, visual diff, restore; Sequence + C4 editors; cross-diagram asset binding. **✅ shipped** (versioning via W10/F1; Sequence + C4 are Mermaid-based).
- **P4 — Team & collaboration** · RBAC polish, comments/@mentions, review workflow, real-time multiplayer (Yjs + Hocuspocus), SSO/SCIM. **◻ not started**
- **P5 — Platform & ecosystem** · full user-defined Asset Catalog + impact analysis, DMN, simulation, executable export (Zeebe/Flowable), plugin SDK, integrations. **◻ not started**

## Where we are (2026-06-21)

P0–P3 are **built and deployed to production on Vercel** (`apps/web`, Neon Postgres, migrations through **0008**). The product today: self-hostable, authed, multi-tenant; draw/save/version BPMN on a polished canvas; a deterministic inspector (also CLI/MCP); an Asset Catalog; and an AI assistant that chats, documents, reviews, and **edits the diagram** (BYOK, brand-agnostic).

The recent push turned the AI from advisor → **co-editor**: tabbed Chat/Problems drawer (W9), History + AI-edit review + persistent chat (W10), and a broad BPMN editing op-set (W11). The AI editing **works end-to-end on all providers** (incl. the Gemini fixes) but its **plan quality is not yet trustworthy** — see Known issues.

## Shipped workstreams

| ID | Workstream |
|----|-----------|
| W1 | Multi-diagram navigation + project/diagram CRUD |
| W2 | CLI + MCP lint server over the inspector |
| W3 | Asset Catalog foundation (schema, CRUD, in-canvas element→asset binding, advisor grounding) |
| W4 | Versioning (named versions, diff, restore) — completed/extended by W10/F1 |
| W5 | Self-host (Dockerfile + docker-compose + docs) |
| W6 | Advisor doc-gen + Q&A |
| W7 | Sequence + C4 editors (Mermaid-based) |
| W9 | AI drawer redesign (tabbed Chat + Problems, proposal cards, doc viewer + DB persistence, token usage) |
| W10 | History & review batch — **F1** auto-versioning + top-bar History dropdown; **F2** AI-edit review (violet marks + Approve/Roll back/Keep refining); **F3** persistent chat + DB knowledge cache + surrogate sanitizer. Spec/plans in `docs/superpowers/{specs,plans}/2026-06-20-*` |
| W11 | BPMN-expert AI editing — **Phases 1–3 deployed**, **Phase 4 built (branch)**. P1–3: move/reassign-lane, reconnect, full task/gateway palette, sub-process, conditional/default flows, event definitions, activity markers + robustness (provider-neutral planner, lane/pool + message-flow grounding, geometric lane membership, deterministic plan validation + self-repair). P4: data objects/stores + text annotations (+ associations), `setDocumentation`. Spec `docs/superpowers/specs/2026-06-21-bpmn-editing-capabilities.md` |

## Known issues (open)

- **★ AI editing plan quality** — on complex/ambiguous requests the planner still **over-engineers** (e.g. invents a new pool + message flow + deletes tasks for a simple "notify" / "move" request). The deterministic validator catches structural faults (orphans, bad refs) but not over-scoped-yet-valid plans. **Needs a scope/soundness guard** (reject or down-scope plans that create pools / delete elements / split processes without an explicit request) and a **real layout pass**. *Deferred — revisit as the next AI-editing focus.*
- **Live smoke tests pending** for W10 (F1/F2/F3) and W11 (P1–P3) — exercised informally during dev; formal pass + sign-off still outstanding.

## Next steps (proposed priority)

1. **Harden AI-editing quality** (the active pain): W11 **Phase 5** — post-plan **scope/soundness validation** (run the inspector on the proposed result; reject/correct over-scoped plans that create pools / delete elements / split processes without an explicit ask) + pool-safe **auto-layout** so applied edits look clean. Highest-leverage fix for the current frustration.
2. **W8 — Provider-connect wizard** (guided BYOK setup + AI Gateway + optional Google OAuth→Vertex). *Note: consumer chat subs (ChatGPT/Claude/Gemini plans) can't power third-party API inference — use AI Gateway / BYOK / Vertex OAuth.*
3. **P4 — Collaboration** (comments → review workflow → multiplayer) once the single-user editing loop is trustworthy.

*(W11 Phase 4 — data objects/stores + text annotations + `setDocumentation` — done, on branch awaiting deploy. User-task assignment + asset-binding-via-proposeEdit deferred as noted.)*

## Backlog / follow-ups

- **Hybrid AI grounding** — compact `ProcessGraph` synopsis by default + an **on-demand raw-BPMN-XML tool** for completeness (extraction is lossy; every un-modelled detail is an AI blind spot). Adopt if extraction gaps keep recurring.
- Asset-link management UI + impact/usage panel (actions exist: `createAssetLink`, `getAssetUsage`).
- Reference-field picker (engine supports `reference`; editor treats it as text).
- `createDiagramVersion` is now callerless — remove or wire to a "Save named version" control.
- Drop the dormant `diagram.archivedAt` column (deferred cleanup from F1).
