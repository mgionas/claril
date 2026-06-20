# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Claril self-host image (multi-stage, pnpm + Turborepo monorepo aware).
#
# Targets:
#   - runner   : the Next.js 16 standalone web app (default build target)
#   - migrator : a thin image that runs `drizzle-kit migrate` against Postgres
#
# Build the web app:      docker build -t claril-web .
# Build the migrator:     docker build --target migrator -t claril-migrate .
# ---------------------------------------------------------------------------

# Pin Node to the active LTS line. Alpine keeps the runtime small; libc6-compat
# is added where native addons may need glibc shims.
ARG NODE_IMAGE=node:22.13.1-alpine
# Match packageManager in package.json (pnpm@11.5.0).
ARG PNPM_VERSION=11.5.0

# ---------------------------------------------------------------------------
# Base: Node + pnpm via corepack, shared by every stage.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    # Avoid pnpm interactive prompts / telemetry noise in CI builds.
    CI=true
RUN apk add --no-cache libc6-compat \
    # Refresh corepack first: the version bundled with Node cannot verify
    # signatures for newer pnpm releases (key rotation). The latest corepack can.
    && npm install -g corepack@latest \
    && corepack enable \
    && corepack prepare "pnpm@${PNPM_VERSION}" --activate
WORKDIR /app

# ---------------------------------------------------------------------------
# Deps: install the full workspace using the committed lockfile. Done in its
# own layer so it is cached unless the lockfile / manifests change.
# ---------------------------------------------------------------------------
FROM base AS deps
# Copy only the files that affect dependency resolution first for cache reuse.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/logic-inspector/package.json ./packages/logic-inspector/package.json
COPY packages/ai-advisor/package.json ./packages/ai-advisor/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Builder: copy the rest of the source and build only the web app via Turbo.
# Produces apps/web/.next/standalone (server bundle nested under apps/web/).
# ---------------------------------------------------------------------------
FROM base AS builder
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Re-link workspace node_modules for any package added after the deps layer.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline
# Build web (and its workspace dependencies via Turbo's `^build`).
RUN pnpm turbo run build --filter=web... \
    # Ensure apps/web/public exists so the runner COPY always succeeds, even
    # when the app ships no static public assets yet.
    && mkdir -p apps/web/public

# ---------------------------------------------------------------------------
# Runner: minimal production image for the standalone Next.js server.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app

# Non-root runtime user.
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# The standalone output nests the server under apps/web/ and ships a pruned
# node_modules. Copy it as the app root, then layer static + public assets.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
# server.js is emitted at apps/web/server.js inside the standalone output.
CMD ["node", "apps/web/server.js"]

# ---------------------------------------------------------------------------
# Migrator: applies Drizzle migrations, then exits. Run as a one-shot service
# (see docker-compose.yml) so the web container starts against a ready schema.
# ---------------------------------------------------------------------------
FROM base AS migrator
ENV NODE_ENV=production
WORKDIR /app/packages/db
# Bring the installed workspace deps (drizzle-kit, drizzle-orm, postgres, dotenv).
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/packages/db/node_modules /app/packages/db/node_modules
# The db package: schema (raw TS), generated SQL migrations, journal, config.
COPY packages/db ./
# drizzle.config.ts probes for .env files but does not override real env vars,
# so DATABASE_URL from the container environment is what gets used.
# Invoke the drizzle-kit bin shim directly. It sets the NODE_PATH for the pnpm
# store layout and execs bin.cjs. Going through `pnpm exec` instead would
# trigger a dependency-status reinstall against a partial workspace and fail.
CMD ["./node_modules/.bin/drizzle-kit", "migrate"]
