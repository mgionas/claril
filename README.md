# Claril

> Open-source, self-hostable **architecture & process intelligence workbench** for Solution Architects and Architects.

Claril is a modeling tool that doesn't just *draw* your processes and systems — it *understands* them. Design **BPMN** processes, **sequence** diagrams, and **C4** architecture models in one place, with a deterministic **logic inspector** that catches structural defects and an **AI advisor** that critiques the design.

## Why Claril

- **Understands, not just draws** — a deterministic logic inspector (deadlocks, gateway mismatches, unreachable steps, soundness) plus an AI advisor for judgment calls.
- **Works without AI** — the full tool, including the inspector, is useful with zero AI configured. AI is an amplifier, never a gate.
- **Bring your own AI** — brand-agnostic, BYOK. Anthropic, OpenAI, Azure, Google, Mistral, or local models (Ollama). Your data stays where you choose.
- **One workbench, many models** — BPMN, Sequence, and C4 diagrams, with a shared, organization-level **Asset Catalog** so you define a service once and reference it everywhere.
- **Self-hostable** — runs entirely in your own infrastructure. Web app + on-prem.

## Status

🚧 Early development. The monorepo, deterministic logic inspector, themed bpmn-js canvas, and auth/persistence layer are in place — see [docs/roadmap.md](docs/roadmap.md).

## Quick start

```bash
pnpm install

# 1. Start Postgres (or point DATABASE_URL at your own)
docker compose -f deploy/docker-compose.yml up -d

# 2. Configure env (one file — the app and migrations both read it)
cp .env.example apps/web/.env.local
#   then set BETTER_AUTH_SECRET — e.g. openssl rand -base64 32
#   (restart the dev server after changing env — Next caches it at boot)

# 3. Apply the schema
pnpm --filter @claril/db db:migrate

# 4. Run the app
pnpm dev                             # http://localhost:3000
```

Run the inspector tests with `pnpm test`.

## Project layout

```
apps/web                  Next.js 16 workbench (canvas + UI)
packages/logic-inspector  deterministic BPMN analysis engine (core IP)
packages/db               Drizzle schema + client (Better Auth + tenancy)
packages/shared           shared types
docs/                     architecture, design system, roadmap, ADRs
```

## Tech

TypeScript monorepo · Next.js · bpmn-js · Better Auth · Drizzle + PostgreSQL · Vercel AI SDK · Tailwind + shadcn/ui

## License

[AGPL-3.0-only](LICENSE)
