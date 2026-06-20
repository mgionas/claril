# Self-hosting Claril with Docker

Claril is self-hostable end to end: one `docker compose up` builds the Next.js
app, starts a vanilla PostgreSQL, applies the database schema, and serves the
workbench. No proprietary cloud dependency is required.

The deterministic features (logic inspector, versioning, catalog) work with **no
AI key configured** — AI is BYOK and configured per-organization at runtime, so
there is nothing AI-related to set in the environment to get started.

## What's in the box

The root `docker-compose.yml` defines three services:

| Service   | Role                                                                 |
|-----------|----------------------------------------------------------------------|
| `db`      | PostgreSQL 17 (pinned), persisted to the `claril_pgdata` volume.      |
| `migrate` | One-shot job that runs Drizzle migrations, then exits. `web` waits for it. |
| `web`     | The Next.js 16 standalone server (non-root, production mode).        |

The image is built from the multi-stage root `Dockerfile`:
- **builder** — pnpm (pinned to the `packageManager` version) installs the
  workspace with the committed lockfile and runs `turbo run build --filter=web...`,
  producing Next's `output: "standalone"` bundle.
- **runner** — minimal `node:22-alpine`, runs as the non-root `nextjs` user, and
  starts `node apps/web/server.js` (the monorepo standalone server nests under
  `apps/web/`).
- **migrator** — the same base plus the `@claril/db` package and `drizzle-kit`,
  used by the `migrate` service.

## Quick start

```bash
# 1. Provide configuration (root .env — compose reads it automatically)
cp .env.example .env
#    then set a real BETTER_AUTH_SECRET:
#    openssl rand -base64 32

# 2. Build and start the whole stack
docker compose up -d --build

# 3. Open the app
open http://localhost:3000
```

On first run the `db` volume is created, `migrate` applies the schema, and `web`
starts once migration completes successfully. Subsequent `docker compose up`
runs reuse the volume; `migrate` is idempotent (already-applied migrations are
skipped).

## Required configuration

These are read from the root `.env` (see `.env.example`):

| Variable             | Required | Default (compose)                                  | Notes |
|----------------------|----------|----------------------------------------------------|-------|
| `BETTER_AUTH_SECRET` | **Yes**  | an insecure placeholder                            | Generate with `openssl rand -base64 32`. Change it for any real deployment. |
| `BETTER_AUTH_URL`    | Yes      | `http://localhost:3000`                            | The externally reachable base URL of the app. |
| `DATABASE_URL`       | No\*     | `postgresql://claril:claril@db:5432/claril`        | \*Defaults to the bundled `db` service. Set this to use external Postgres. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | No | `claril` / `claril` / `claril` | Credentials for the bundled `db` service. |
| `POSTGRES_PORT`      | No       | `5432`                                             | Host port for the bundled Postgres. |
| `WEB_PORT`           | No       | `3000`                                             | Host port for the web app. |

Secrets are never baked into the image — they are passed as runtime environment.

## Using an external Postgres (e.g. Neon)

Claril depends only on a standard `DATABASE_URL`; any vanilla Postgres works.
To skip the bundled database:

1. Set `DATABASE_URL` in `.env` to your external connection string (include
   `?sslmode=require` for managed providers like Neon).
2. Start only the migration job and the app:

   ```bash
   docker compose up -d --build migrate web
   ```

   The `db` service is simply left unused. (You can also delete the `db` service
   and the `depends_on: db` blocks from a copy of the compose file if you prefer
   a slimmer file.)

## Running migrations manually

The `migrate` service runs `drizzle-kit migrate` automatically before `web`
starts. To run it on demand (e.g. after pulling a new image with new
migrations):

```bash
docker compose run --rm migrate
```

## Operations

```bash
docker compose logs -f web        # tail the app logs
docker compose ps                 # service / health status
docker compose down               # stop (keeps the data volume)
docker compose down -v            # stop AND delete the Postgres volume (data loss)
```

## Building the image directly

```bash
docker build -t claril-web .                       # the web runner (default? no — see note)
docker build --target runner   -t claril-web .     # the web app image
docker build --target migrator -t claril-migrate . # the migration job image
```

> Note: the `Dockerfile` defines `migrator` as the last stage, so a bare
> `docker build` targets it. Use `--target runner` for the web image, or just
> use `docker compose` which selects the correct target per service.

## Notes

- Base images are pinned (Node and Postgres) — no bare `latest` tags.
- The runtime container runs as a non-root user with `NODE_ENV=production`.
- Licensed AGPL-3.0-only; the bundled Postgres is upstream/vanilla.
