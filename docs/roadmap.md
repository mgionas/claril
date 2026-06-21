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
| W11 | BPMN-expert AI editing — **Phases 1–3 deployed**, **Phase 4 built (branch)**. P1–3: move/reassign-lane, reconnect, full task/gateway palette, sub-process, conditional/default flows, event definitions, activity markers + robustness (provider-neutral planner, lane/pool + message-flow grounding, geometric lane membership, deterministic plan validation + self-repair). P4: data objects/stores + text annotations (+ associations), `setDocumentation`. **Phase 5.1–5.2 built (branch)**: scope guard + soundness validation in the planner self-repair (curbs over-engineering); P5.3 relayout deferred. Spec `docs/superpowers/specs/2026-06-21-bpmn-editing-capabilities.md` |
| W8 | AI provider connect — **iteration 1 deployed** (guided wizard: per-provider description, how-to steps + console link, key-format placeholder + soft `keyLooksValid` warning). **Iteration 2 built (branch): multi-provider switching** — migration `0003` applied (prod); provider-aware resolver (`getOrgAiConfig(orgId, opts?)` over `ai_connection`/`ai_org_default`, pure unit-tested `resolveConnection`/`repointDefault`) + `listOrgConnections`; write actions `connectAiProvider`/`removeAiProvider`/`setOrgDefaultModel` + `getAiSettings`; advisor actions + chat route take a per-run `override`; settings **connections-manager** (cards grid, org-default selector, guided connect form reused per card — unified across dialog + `/settings/ai`, legacy single-config removed); workbench **ModelSwitcher** (per-session override + set-as-org-default). Specs/plans `docs/superpowers/{specs,plans}/2026-06-21-w8-*`; blueprint `docs/multi-provider-ai.md`. *Queued: AI Gateway, Vertex OAuth, `DROP TABLE ai_provider_config` cleanup.* |

## Known issues (open)

- **AI editing plan quality** — the over-engineering drift (inventing pools / message flows / deleting tasks for a simple "notify"/"move") is now guarded deterministically: **scope guard** (rejects pool/lane/message-flow/node-delete ops the instruction didn't authorize) + **soundness validation** (simulates the plan and rejects results with new structural errors), both folded into the planner's self-repair retry (W11 Phase 5.1–5.2, on branch). *Pending live confirmation it's enough; a full pool-safe relayout (Phase 5.3) is deferred — make-space handles the common case.*
- **Live smoke tests pending** for W10 (F1/F2/F3) and W11 (P1–P3) — exercised informally during dev; formal pass + sign-off still outstanding.

## Next steps (proposed priority)

1. **Confirm AI-editing quality live** — verify the Phase 5 scope + soundness guards actually stop the over-engineering on the real failing prompts; if layout still looks messy, decide whether the deferred **Phase 5.3 pool-safe relayout** is worth the risk.
2. **W8 — AI provider connect.** Iteration 1 (guided wizard) **deployed**. Iteration 2 (**multi-provider switching**) **built on branch `feat/ai-multi-provider`** — pending live verify + deploy (migration `0003` already applied to prod). Queued: AI Gateway, Google OAuth→Vertex, `DROP TABLE ai_provider_config` cleanup. *Note: consumer chat subs (ChatGPT/Claude/Gemini plans) can't power third-party API inference — use AI Gateway / BYOK / Vertex OAuth.*
3. **P4 — Collaboration** (comments → review workflow → multiplayer) once the single-user editing loop is trustworthy.

*Deferred: W11 Phase 5.3 (pool-safe relayout — runtime-risky); user-task assignment + asset-binding-via-proposeEdit (Phase 4); the two Phase-4 minors (associate connection-hint, artifact ids in synopsis id table).*

## Backlog / follow-ups

- **Hybrid AI grounding** — compact `ProcessGraph` synopsis by default + an **on-demand raw-BPMN-XML tool** for completeness (extraction is lossy; every un-modelled detail is an AI blind spot). Adopt if extraction gaps keep recurring.
- Asset-link management UI + impact/usage panel (actions exist: `createAssetLink`, `getAssetUsage`).
- Reference-field picker (engine supports `reference`; editor treats it as text).
- `createDiagramVersion` is now callerless — remove or wire to a "Save named version" control.
- Drop the dormant `diagram.archivedAt` column (deferred cleanup from F1).
