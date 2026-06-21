import type { Metadata } from "next";
import { A, Callout, DocHeader, H2, InlineCode, Li, Ol, P, Ul } from "../_components/prose";

export const metadata: Metadata = {
  title: "AI providers (BYOK)",
  description:
    "Claril is provider-agnostic and bring-your-own-key. Connect Anthropic, OpenAI, Google, Mistral, Ollama, or OpenRouter; keys are encrypted per organization with an org default model and per-run switching.",
};

const providers: { name: string; note: string }[] = [
  { name: "Anthropic", note: "Claude models." },
  { name: "OpenAI", note: "GPT models." },
  { name: "Google", note: "Gemini models." },
  { name: "Mistral", note: "Mistral hosted models." },
  {
    name: "Ollama",
    note: "Local / self-hosted inference — no key required, just a reachable endpoint.",
  },
  {
    name: "OpenRouter",
    note: "An OpenAI-compatible gateway fronting many providers; \"auto\" routes for you.",
  },
];

export default function AiProvidersPage() {
  return (
    <article>
      <DocHeader
        eyebrow="AI providers"
        title="Bring your own key"
        intro="Claril's AI layer is brand-agnostic and BYOK. No keys ship with the product, and AI is never required — the deterministic inspector is fully useful with nothing connected."
      />

      <Callout tone="accent">
        AI is progressive enhancement. A quiet <InlineCode>AI: off / connected</InlineCode> pill
        reflects status, and <InlineCode>✦</InlineCode> marks features AI makes better — never
        features it blocks.
      </Callout>

      <H2 id="supported">Supported providers</H2>
      <P>Connect any combination of these at the organization level:</P>
      <ul className="mt-4 grid gap-px overflow-hidden rounded-[10px] border border-hairline bg-hairline sm:grid-cols-2">
        {providers.map((p) => (
          <li key={p.name} className="bg-canvas p-5">
            <h3 className="text-sm font-semibold text-fg">{p.name}</h3>
            <p className="mt-1 text-sm leading-relaxed text-fg-muted">{p.note}</p>
          </li>
        ))}
      </ul>

      <H2 id="storage">How keys are stored</H2>
      <Ul>
        <Li>
          Keys are configured at the <strong>organization</strong> level — each org connects each
          provider at most once.
        </Li>
        <Li>
          Keys are <strong>encrypted at rest</strong> (AES-256-GCM) and strictly org-scoped. They are
          never returned to the client and never baked into any build.
        </Li>
        <Li>
          On a self-hosted instance, inference requests go from your server straight to your chosen
          provider with your credentials — no middleman.
        </Li>
        <Li>
          <strong>Ollama</strong> needs no key; provide a base URL for your local or self-hosted
          endpoint instead.
        </Li>
      </Ul>

      <H2 id="defaults">Org default &amp; per-run switching</H2>
      <P>
        An organization picks <strong>one default model</strong> across its connected providers — the
        model the advisor uses unless told otherwise. The default is an org-level property, so exactly
        one default exists at a time.
      </P>
      <Ol>
        <Li>
          Each connected provider has its own <strong>default model</strong> (seeded from a sensible
          recommendation, changeable in settings).
        </Li>
        <Li>
          The org-level <strong>default model</strong> selects which connected{" "}
          <InlineCode>(provider, model)</InlineCode> the advisor uses by default.
        </Li>
        <Li>
          In the workbench, a compact selector lists every model across all connected providers so
          you can switch the model <strong>per run</strong> — and optionally set your choice as the
          new org default.
        </Li>
      </Ol>

      <H2 id="connect">Connecting a provider</H2>
      <Ol>
        <Li>Open organization settings and find the AI providers / connections section.</Li>
        <Li>
          Add a provider, paste your API key (and an optional base URL for proxies or self-hosted
          endpoints), and choose a default model.
        </Li>
        <Li>
          Use <strong>Test</strong> to verify the credentials reach the provider, then set or adjust
          the org default model.
        </Li>
      </Ol>
      <P>
        These controls require an org owner or admin. Once a usable connection exists, the AI
        co-editor — documentation, review, conversational editing, and proposed edits — becomes
        available. See <A href="/docs/getting-started">Getting started</A> for the end-to-end flow.
      </P>
    </article>
  );
}
