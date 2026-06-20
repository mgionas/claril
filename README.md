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

🚧 Early development. Architecture and roadmap are being defined.

## Tech

TypeScript monorepo · Next.js · bpmn-js · Better Auth · Drizzle + PostgreSQL · Vercel AI SDK · Tailwind + shadcn/ui

## License

[AGPL-3.0-only](LICENSE)
