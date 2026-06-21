import type { Metadata } from "next";
import { A, Callout, CodeBlock, DocHeader, H2, InlineCode, Li, Ol, P, Ul } from "../_components/prose";

export const metadata: Metadata = {
  title: "Self-hosting",
  description:
    "Self-host Claril end to end with Docker Compose: the Next.js app, PostgreSQL, and automatic Drizzle migrations — or bring your own external Postgres such as Neon.",
};

export default function SelfHostingPage() {
  return (
    <article>
      <DocHeader
        eyebrow="Self-hosting"
        title="Run Claril with Docker"
        intro="Claril is self-hostable end to end. One docker compose up builds the Next.js app, starts PostgreSQL, applies the database schema, and serves the workbench. No proprietary cloud dependency is required."
      />

      <Callout tone="accent">
        The deterministic features (logic inspector, versioning, catalog) work with{" "}
        <strong>no AI key configured</strong>. AI is BYOK and configured per-organization at runtime,
        so there is nothing AI-related to set in the environment to get started.
      </Callout>

      <H2 id="services">What&apos;s in the box</H2>
      <P>
        The root <InlineCode>docker-compose.yml</InlineCode> defines three services:
      </P>
      <Ul>
        <Li>
          <InlineCode>db</InlineCode> — PostgreSQL 17 (pinned), persisted to the{" "}
          <InlineCode>claril_pgdata</InlineCode> volume.
        </Li>
        <Li>
          <InlineCode>migrate</InlineCode> — a one-shot job that runs Drizzle migrations, then exits;{" "}
          <InlineCode>web</InlineCode> waits for it.
        </Li>
        <Li>
          <InlineCode>web</InlineCode> — the Next.js standalone server, running as a non-root user in
          production mode.
        </Li>
      </Ul>
      <P>
        The image is built from the multi-stage root <InlineCode>Dockerfile</InlineCode>: a{" "}
        <strong>builder</strong> stage installs the workspace with the committed lockfile and produces
        Next&apos;s <InlineCode>output: &quot;standalone&quot;</InlineCode> bundle; a{" "}
        <strong>runner</strong> stage serves it on minimal <InlineCode>node:22-alpine</InlineCode>;
        and a <strong>migrator</strong> stage carries <InlineCode>@claril/db</InlineCode> plus{" "}
        <InlineCode>drizzle-kit</InlineCode> for the migration job.
      </P>

      <H2 id="quick-start">Quick start</H2>
      <CodeBlock title="one-command stack">
        {`# 1. Provide configuration (root .env — compose reads it automatically)
cp .env.example .env
#    then set a real BETTER_AUTH_SECRET:
#    openssl rand -base64 32

# 2. Build and start the whole stack
docker compose up -d --build

# 3. Open the app  ->  http://localhost:3000`}
      </CodeBlock>
      <P>
        On first run the <InlineCode>db</InlineCode> volume is created,{" "}
        <InlineCode>migrate</InlineCode> applies the schema, and <InlineCode>web</InlineCode> starts
        once migration completes. Subsequent runs reuse the volume;{" "}
        <InlineCode>migrate</InlineCode> is idempotent (already-applied migrations are skipped).
      </P>

      <H2 id="config">Required configuration</H2>
      <P>
        These are read from the root <InlineCode>.env</InlineCode> (see{" "}
        <InlineCode>.env.example</InlineCode>). Secrets are never baked into the image — they are
        passed as runtime environment.
      </P>
      <Ul>
        <Li>
          <InlineCode>BETTER_AUTH_SECRET</InlineCode> — <strong>required</strong>. Generate with{" "}
          <InlineCode>openssl rand -base64 32</InlineCode>. Change it for any real deployment.
        </Li>
        <Li>
          <InlineCode>BETTER_AUTH_URL</InlineCode> — the externally reachable base URL of the app
          (default <InlineCode>http://localhost:3000</InlineCode>).
        </Li>
        <Li>
          <InlineCode>DATABASE_URL</InlineCode> — defaults to the bundled <InlineCode>db</InlineCode>{" "}
          service (<InlineCode>postgresql://claril:claril@db:5432/claril</InlineCode>). Set this to
          use external Postgres.
        </Li>
        <Li>
          <InlineCode>POSTGRES_USER</InlineCode> / <InlineCode>POSTGRES_PASSWORD</InlineCode> /{" "}
          <InlineCode>POSTGRES_DB</InlineCode> — credentials for the bundled database (default{" "}
          <InlineCode>claril</InlineCode>).
        </Li>
        <Li>
          <InlineCode>POSTGRES_PORT</InlineCode> / <InlineCode>WEB_PORT</InlineCode> — host ports
          (default <InlineCode>5432</InlineCode> / <InlineCode>3000</InlineCode>).
        </Li>
      </Ul>

      <H2 id="external-postgres">Using an external Postgres (e.g. Neon)</H2>
      <P>
        Claril depends only on a standard <InlineCode>DATABASE_URL</InlineCode>; any vanilla Postgres
        works. To skip the bundled database:
      </P>
      <Ol>
        <Li>
          Set <InlineCode>DATABASE_URL</InlineCode> in <InlineCode>.env</InlineCode> to your external
          connection string (include <InlineCode>?sslmode=require</InlineCode> for managed providers
          like Neon).
        </Li>
        <Li>Start only the migration job and the app:</Li>
      </Ol>
      <CodeBlock>{`docker compose up -d --build migrate web`}</CodeBlock>
      <P>
        The <InlineCode>db</InlineCode> service is simply left unused.
      </P>

      <H2 id="migrations">Running migrations</H2>
      <P>
        The <InlineCode>migrate</InlineCode> service runs <InlineCode>drizzle-kit migrate</InlineCode>{" "}
        automatically before <InlineCode>web</InlineCode> starts. To run it on demand (e.g. after
        pulling a new image with new migrations):
      </P>
      <CodeBlock>{`docker compose run --rm migrate`}</CodeBlock>
      <P>
        Outside Docker (local development), apply the schema directly with the workspace script:
      </P>
      <CodeBlock>{`pnpm --filter @claril/db db:migrate`}</CodeBlock>

      <H2 id="operations">Operations</H2>
      <CodeBlock title="common commands">
        {`docker compose logs -f web    # tail the app logs
docker compose ps             # service / health status
docker compose down           # stop (keeps the data volume)
docker compose down -v        # stop AND delete the Postgres volume (data loss)`}
      </CodeBlock>
      <Callout tone="warn">
        <InlineCode>docker compose down -v</InlineCode> deletes the Postgres volume and all stored
        diagrams. Use plain <InlineCode>down</InlineCode> to stop without losing data.
      </Callout>

      <H2 id="notes">Notes</H2>
      <Ul>
        <Li>Base images are pinned (Node and Postgres) — no bare latest tags.</Li>
        <Li>
          The runtime container runs as a non-root user with{" "}
          <InlineCode>NODE_ENV=production</InlineCode>.
        </Li>
        <Li>Licensed AGPL-3.0-only; the bundled Postgres is upstream / vanilla.</Li>
      </Ul>
      <P>
        Next: lint your models outside the app with the <A href="/docs/cli">CLI &amp; MCP</A>.
      </P>
    </article>
  );
}
