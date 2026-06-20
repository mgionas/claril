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

## P0 task breakdown (current focus)
- [x] Repo, license, README, docs, agent team, Archmantic manifest
- [ ] Monorepo: pnpm-workspace, turbo.json, base tsconfig, eslint/prettier
- [ ] `packages/shared` (types + zod), `packages/logic-inspector` (engine + tests)
- [ ] `apps/web`: Next.js 16 + Tailwind 4 + shadcn baseline, dark theme tokens
- [ ] bpmn-js canvas component with themed rendering + import/export
- [ ] `packages/db`: Drizzle schema (org→workspace→project→diagram→version) + migrations
- [ ] Better Auth wiring (org plugin) + sign-in
- [ ] Save/load diagram to Postgres
- [ ] docker-compose (web + postgres)

> The logic-inspector is started early (P0/P1 boundary) because it's pure TS, framework-free, and the product's core IP — it can be built and tested in isolation before the app is wired up.
