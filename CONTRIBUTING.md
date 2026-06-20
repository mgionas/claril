# Contributing to Claril

Thanks for your interest! Claril is an open-source ([AGPL-3.0](LICENSE)) architecture & process intelligence workbench.

## Before you start
- Read [docs/README.md](docs/README.md) — especially the **core invariants** and [docs/architecture.md](docs/architecture.md).
- This is a **TypeScript monorepo** (pnpm + Turborepo). Use the **latest** stable library versions.

## Dev setup
```bash
pnpm install
pnpm dev          # run the web app
pnpm test         # run unit tests (logic-inspector etc.)
pnpm build        # build all packages
```

## Ground rules (non-negotiable)
1. **Deterministic features must work with no AI key.** AI is an amplifier, never a gate.
2. **No proprietary cloud dependency in core** — Claril must run fully self-hosted on vanilla Postgres.
3. **BPMN XML stays the source of truth** — keep it valid and round-trippable.
4. **Every logic-inspector rule ships with tests** (positive + negative cases).
5. **Don't hardcode colors** — use the shared design tokens (CSS variables).

## Workflow
- Branch from `main`; open a PR. Keep PRs focused.
- Match the surrounding code style. Run `pnpm lint` and `pnpm test` before pushing.
- Significant decisions get an ADR in `docs/decisions/`.

## License of contributions
By contributing you agree your contributions are licensed under AGPL-3.0-only. (A CLA may be introduced before a hosted/enterprise edition — TBD.)
