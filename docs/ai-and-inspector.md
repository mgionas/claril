# Logic Inspector & AI Advisor

The two halves of Claril's intelligence layer. **The inspector guarantees facts; the AI explains and judges.**

## The governing principle
> The tool is complete and genuinely useful with **zero AI**. Because the wedge (the Logic Inspector) is deterministic, the core value works with no key. AI is an amplifier, never a gate.

## Logic Inspector (deterministic, `packages/logic-inspector`)
Pure TypeScript, no framework, no AI. Parses a BPMN object model into a graph and runs pluggable rules.

**Output:** `Finding { ruleId, severity: 'error'|'warning'|'info', elementId?, message, quickFix? }`

**Rule tiers (build in order):**
1. **Structural (errors):** unreachable activities, missing start/end events, dangling sequence flows, gateway split/join mismatch, deadlock, livelock / unbounded loops.
2. **Soundness:** map BPMN → workflow-net; check soundness (option to complete, proper completion, no dead transitions). Heuristics first; formal workflow-net soundness as a flagged follow-up.
3. **Best-practice (warnings):** missing roles/lanes, unlabeled gateways/flows, implicit gateways, complexity score, naming consistency.

Every rule ships with unit tests (positive + negative). Findings are consumable in the UI **and** via CLI/MCP (lint your models in CI).

## AI Advisor (`packages/ai-advisor`)
Provider-agnostic (Vercel AI SDK behind our `LLMProvider`), BYOK, structured output via Zod. Its job is **judgment**, not correctness.

- Receives the diagram + the inspector's findings + linked Asset Catalog metadata → grounded prompts, low hallucination.
- Returns typed `Finding[]` / `EditProposal[]`.

## The 3-tier capability model
| Tier | Needs key? | Examples |
|---|---|---|
| 🟢 **T1 Core** | No | BPMN editing, import/export, **full logic inspector**, versioning/diff, collab/RBAC, catalog, keyword search, simulation, MCP API |
| 🔵 **T2 Enhanced** | Optional | Findings get AI explanation/prioritization; doc narrative; semantic search; smart naming. Works without, better with. |
| ✦ **T3 AI-only** | Yes | NL→BPMN, conversational editing, advisor critique (anti-patterns, automation candidates), Q&A, compliance checks |

## BYOK & providers
- Adapters: Anthropic, OpenAI, Azure OpenAI, Google, Mistral, **Ollama (local)**.
- Keys configured at **Organization** level, encrypted at rest. No keys ship with the product.
- First-run: detect local Ollama and offer it; otherwise show a BYOK panel with a clear "skip — use without AI".
- Model defaults: use the **latest** Claude models; consult the `claude-api` skill for current IDs/pricing. Always honor the user's configured provider/model first.

## UX of "with vs without AI"
- Quiet `AI: off / connected` pill in the command bar.
- `✦` badge = "AI makes this better," never "blocked".
- T3 features are visible-but-inert with one-click setup — never hidden, never a blocking modal.
- T2 features always work; an unobtrusive `✦ Explain & fix with AI` ghost affordance appears where AI would help.
