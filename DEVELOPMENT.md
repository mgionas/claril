# Development & self-hosting

Everything you need to run Claril locally or on your own infrastructure. For what
Claril *is* and why, see the [README](README.md).

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

## Self-hosting (Docker)

Run the whole stack (app + Postgres + migrations) with one command:

```bash
cp .env.example .env     # then set BETTER_AUTH_SECRET
docker compose up -d --build   # http://localhost:3000
```

See [docs/self-hosting.md](docs/self-hosting.md) for required env vars, using an
external Postgres (e.g. Neon), and operations.

## Project layout

```
apps/web                  Next.js 16 workbench (canvas + UI)
packages/logic-inspector  deterministic BPMN analysis engine (core IP)
packages/db               Drizzle schema + client (Better Auth + tenancy)
packages/shared           shared types
docs/                     architecture, design system, roadmap, ADRs
```

## Tech stack

TypeScript monorepo · Next.js · bpmn-js · Better Auth · Drizzle + PostgreSQL · Vercel AI SDK · Tailwind + shadcn/ui

## Contributing

Issues and PRs welcome — Claril is open source under
[AGPL-3.0-only](LICENSE). Start with the
[roadmap](docs/roadmap.md) and
[architecture docs](docs/architecture.md) to get oriented, file bugs and ideas at
<https://github.com/mgionas/claril/issues>, and run `pnpm typecheck` and
`pnpm test` before opening a PR.
