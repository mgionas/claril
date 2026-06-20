# Architecture

## Stack (latest stable versions — verify with `npm view`)
| Layer | Choice | Notes |
|---|---|---|
| Language | **TypeScript** (6.x) | Everywhere — one language for contributors |
| Web framework | **Next.js 16** (App Router, React 19.2) | Self-host via `output: 'standalone'` Docker |
| BPMN editor | **bpmn-js 18** | BPMN 2.0 engine + XML interop (source of truth) |
| Sequence editor | **Mermaid** (or visual lib) | Text-as-code; compiles for storage |
| C4 editor | **LikeC4 / Structurizr DSL** | Model-based C4 (optional, not a forced hierarchy) |
| UI | **Tailwind 4 + shadcn/ui** (Radix) | Lucide icons, cmdk, Framer Motion |
| Auth | **Better Auth** | Self-hosted in our Postgres; organization plugin |
| ORM / DB | **Drizzle** + **PostgreSQL** | Neon for hosted/dev; vanilla Postgres on-prem |
| AI | **Vercel AI SDK 6** | Behind our own `LLMProvider`; brand-agnostic, BYOK |
| Monorepo | **pnpm + Turborepo** | |

## Monorepo layout
```
claril/
├── apps/
│   ├── web/              Next.js 16 app (UI + dashboard API)
│   └── mcp/              standalone MCP/REST analysis server (later phase)
├── packages/
│   ├── core-bpmn/        bpmn-js wrappers, BPMN XML <-> object model
│   ├── logic-inspector/  ★ deterministic analysis engine (core IP, zero deps on framework/AI)
│   ├── ai-advisor/       provider-agnostic LLM layer (Vercel AI SDK)
│   ├── catalog/          Asset Catalog domain logic + custom-schema engine
│   ├── db/               Drizzle schema, migrations, query helpers
│   ├── ui/               shared shadcn components + design tokens
│   └── shared/           types, zod schemas, utils
├── docs/
└── deploy/               docker-compose (app + Postgres), Helm later
```

### Why shared packages
`logic-inspector` and `ai-advisor` are framework-free packages so they can be consumed by **both** the Next.js app **and** a standalone MCP/REST server (inbound AI providers + outbound "analysis as a service"). For V1 the engine runs inside Next route handlers; splitting out `apps/mcp` later is cheap because the logic already lives in packages.

## AI integration model
- **Inbound:** pluggable `LLMProvider` adapters (Anthropic, OpenAI, Azure, Google, Mistral, Ollama). BYOK, org-level encrypted keys.
- **Outbound:** expose logic-inspector + advisor as MCP tools + REST so agents/CI/IDEs can call Claril's analysis.
- **Grounding:** prompts always include deterministic inspector findings + linked Asset Catalog metadata → less hallucination.
- **Degradation:** no key ⇒ deterministic features fully work; AI features are visibly inert with one-click setup.

## Deployment
- Canonical artifact: **`docker-compose`** (app + Postgres) — on-prem is first-class, not bolted on.
- Hosted option: Vercel + Neon (the app must not depend on Neon-proprietary features — standard `DATABASE_URL` only).
- Helm chart for k8s later.

## Self-host constraints (hard rules)
- No proprietary hosted dependency in core (this is why Clerk was rejected for auth, Better Auth chosen).
- All real-time/collab infra self-hostable (Yjs + Hocuspocus, later phase).
- Object storage: Postgres for V1; S3-compatible + MinIO for on-prem later.
