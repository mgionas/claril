# Claril

### The architecture workbench that *understands* your diagrams — not just draws them.

Claril is an open-source, self-hostable workbench for Solution Architects and
Architects. Model **BPMN** processes, **sequence** diagrams, and **C4**
architecture in one place — backed by a deterministic logic inspector that
catches structural defects and an optional AI advisor that critiques the design.

> [!WARNING]
> **Claril is in alpha.** We're building in the open, so expect rough edges and
> moving pieces. We'd genuinely love your feedback — file bugs, ideas, and gripes
> at **[github.com/mgionas/claril/issues](https://github.com/mgionas/claril/issues)**.

## ✨ Why Claril

- **Understands, not just draws** — a deterministic inspector flags deadlocks, gateway mismatches, unreachable steps, and soundness issues; AI handles the judgment calls.
- **Works without AI** — the full tool, inspector included, is useful with zero AI configured. AI is an amplifier, never a gate.
- **Bring your own key** — brand-agnostic BYOK: Anthropic, OpenAI, Azure, Google, Mistral, or local models. Your data stays where you choose.
- **One workbench, many models** — BPMN, Sequence, and C4 share an org-level **Asset Catalog**, so you define a service once and reference it everywhere.
- **Self-hostable** — runs entirely on your own infrastructure. Diagrams and metadata never have to leave your network.
- **Open source (AGPL-3.0)** — read it, fork it, contribute back. No black boxes in your toolchain.

## 🔗 Links

- **Live app** — <https://claril.dev>
- **Docs** — [`/docs`](docs/) (architecture, design system, AI & inspector, self-hosting)
- **Running locally / self-hosting** — see [DEVELOPMENT.md](DEVELOPMENT.md)
- **Roadmap** — [docs/roadmap.md](docs/roadmap.md)
- **Feedback & issues** — <https://github.com/mgionas/claril/issues>

## License

[AGPL-3.0-only](LICENSE)
