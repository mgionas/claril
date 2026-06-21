import type { Metadata } from "next";
import { A, Callout, CodeBlock, DocHeader, H2, InlineCode, Li, Ol, P, Ul } from "../_components/prose";

export const metadata: Metadata = {
  title: "Getting started",
  description:
    "Sign up, create a project, draw a diagram, run the deterministic inspector, and optionally connect an AI provider with your own key.",
};

export default function GettingStartedPage() {
  return (
    <article>
      <DocHeader
        eyebrow="Getting started"
        title="Your first diagram"
        intro="From a fresh account to a checked diagram in a few minutes. AI is entirely optional — everything below works with no key configured."
      />

      <H2 id="account">1. Create an account</H2>
      <P>
        On a hosted or self-hosted instance, open the app and choose{" "}
        <strong>Get started</strong> to sign up, or <strong>Sign in</strong> if you already have an
        account.
      </P>

      <H2 id="space">2. Choose a space</H2>
      <P>
        You land in your <strong>Personal</strong> space — a solo area with your own BYOK AI (no
        shared catalog). To collaborate, create an <strong>Organization</strong>: invite members
        (owner / admin / member) and group work into <strong>Workspaces</strong> with their own roles
        (admin / editor / viewer), a shared Asset Catalog, and shared AI. Switch between spaces any
        time with the context switcher.
      </P>

      <H2 id="draw">3. Draw a diagram</H2>
      <P>
        From the dashboard, create a new diagram and pick a kind — <strong>BPMN</strong>,{" "}
        <strong>Sequence</strong>, or <strong>C4</strong>. The canvas is keyboard-first; press{" "}
        <InlineCode>⌘K</InlineCode> for the command palette to reach any action quickly. Build your
        flow with events, tasks, and gateways (for BPMN), wiring elements together with sequence
        flows. Every change is versioned automatically; you can also name a version, diff revisions,
        and restore.
      </P>

      <H2 id="inspect">4. Run the inspector</H2>
      <P>
        The deterministic logic inspector runs continuously as you edit. It flags structural
        problems — deadlocks, unreachable steps, missing start/end events, gateway split/join
        mismatches, and soundness violations — as <strong>findings</strong> pinned to the offending
        element.
      </P>
      <Ul>
        <Li>Each finding has a severity: error, warning, or info.</Li>
        <Li>Click a finding to fly the camera to the element it concerns.</Li>
        <Li>Where a quick-fix exists, apply it with one click.</Li>
      </Ul>
      <Callout tone="accent">
        The inspector is computed, not generated — its findings are the same whether you run them in
        the editor, the <A href="/docs/cli">CLI, or over MCP</A>.
      </Callout>

      <H2 id="ai">5. (Optional) Connect an AI provider</H2>
      <P>
        AI is progressive enhancement. To enable the AI co-editor — generate BPMN from a prompt, chat
        grounded on findings and the Asset Catalog, AI-proposed edits you review (approve, roll back,
        or keep refining), and Markdown doc-gen — connect a provider with your own key in your current
        space.
      </P>
      <Ol>
        <Li>
          Open settings for your personal space or organization and find the AI providers /
          connections section.
        </Li>
        <Li>
          Choose a provider (Anthropic, OpenAI, Google, Mistral, Ollama, or OpenRouter) and paste
          your API key. Keys are encrypted at rest and never leave your instance.
        </Li>
        <Li>
          Your first connection becomes the default automatically. In the workbench, use the model
          switcher to pick any connected model per session. For local inference, point at{" "}
          <InlineCode>Ollama</InlineCode> — no key required, just a reachable endpoint.
        </Li>
      </Ol>
      <P>
        Once connected, a quiet <InlineCode>AI: connected</InlineCode> pill appears and{" "}
        <InlineCode>✦</InlineCode> affordances light up where AI can help. See{" "}
        <A href="/docs/ai-providers">AI providers</A> for the full list and how keys are stored.
      </P>

      <H2 id="collaborate">6. Comment &amp; @mention (organizations)</H2>
      <P>
        In an organization, leave threaded <strong>comments</strong> anchored to a specific element
        or to the whole diagram, and <InlineCode>@mention</InlineCode> teammates to pull them in.
        Mentions and replies surface in the in-app <strong>notification bell</strong>. Collaboration
        is async — no realtime cursors — so it works across time zones. (Comments are available in
        personal space too, just without teammates to mention.)
      </P>

      <H2 id="export">7. Export</H2>
      <P>
        From the workbench top bar, download the source <InlineCode>.bpmn</InlineCode> or export the
        diagram as <strong>PNG</strong> or <strong>PDF</strong> to drop into docs, tickets, or
        reviews.
      </P>

      <H2 id="self-host">Running it yourself</H2>
      <P>
        To stand up your own instance, clone the repository, start Postgres, apply the schema, and
        run the app:
      </P>
      <CodeBlock title="local development">
        {`pnpm install

# 1. Start Postgres (or point DATABASE_URL at your own)
docker compose -f deploy/docker-compose.yml up -d

# 2. Configure env (the app and migrations both read it)
cp .env.example apps/web/.env.local
#    then set BETTER_AUTH_SECRET — e.g. openssl rand -base64 32

# 3. Apply the schema
pnpm --filter @claril/db db:migrate

# 4. Run the app  ->  http://localhost:3000
pnpm dev`}
      </CodeBlock>
      <P>
        For a one-command production stack, see <A href="/docs/self-hosting">Self-hosting</A>.
      </P>
    </article>
  );
}
