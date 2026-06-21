# W13 — Personal/Org Tenancy (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Lay the data + resolution foundation for the personal subsystem alongside the existing org subsystem, sharing the diagram engine — schema, additive migration, personal AI resolver, and access/parent helpers — unit-tested and **shipped dark** (no UX, behavior unchanged).

**Architecture:** New `personal_project` + `user_ai_connection`/`user_ai_default` tables; `diagram` gains a nullable `personalProjectId` (XOR with a now-nullable `projectId`, enforced by a CHECK). Personal AI reuses the existing **pure** `resolveConnection`/`repointDefault` core (W8). A pure `diagramParent` helper + extended access checks resolve the XOR parent. No personal data is created yet (Phase 2), so all current code paths keep working.

**Spec:** `docs/superpowers/specs/2026-06-21-w13-personal-org-tenancy-design.md`.

**Out of scope (later phases):** context switcher + personal dashboard (P2), personal AI settings UI + catalog gating (P3), org workspaces UI + `workspaceRole` enum formalization (P4), legacy data migration (P5).

**Verified facts:**
- Schema in `packages/db/src/schema/app.ts`; imports `index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex` from `drizzle-orm/pg-core`, and `{ organization, user }` from `./auth`. `diagram.projectId` is currently `NOT NULL` with `index("diagram_project_idx")`.
- W8 pure core in `apps/web/lib/ai.ts`: `resolveConnection(conns: ConnRow[], orgDefault, opts?)`, `repointDefault`, types `ConnRow`/`ConnectionView`/`AiOverride`, plus `getOrgAiConfig`/`listOrgConnections`. `ConnRow = { provider; encryptedKey; defaultModel; baseUrl }`. Unit tests in `apps/web/lib/ai.test.ts`; vitest alias `@/` configured in `apps/web/vitest.config.ts`.
- Access helpers in `apps/web/lib/tenancy.ts` (`assertProjectAccess`, `assertDiagramAccess`, etc.).
- `diagram.projectId` readers to touch: `apps/web/lib/ai-usage.ts` (`projectIdForDiagram`), `apps/web/lib/diagram-actions.ts` (listing/joins), `apps/web/lib/tenancy.ts` (`assertDiagramAccess`). `catalog-actions.ts:422` joins on the column ref (no value read — unaffected).

---

### Task 1: Schema + additive migration

**Files:** `packages/db/src/schema/app.ts`

- [ ] **Step 1: Add imports** — extend the `drizzle-orm/pg-core` import with `check`, and add `import { sql } from "drizzle-orm";` at the top of `app.ts`:
```tsx
import { check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organization, user } from "./auth";
```

- [ ] **Step 2: Add the `personal_project` table** (place it just above the `diagram` table so the lazy FK resolves cleanly; lazy `() =>` refs make order non-critical, but keep it readable):
```tsx
/**
 * Personal subsystem: a user-owned project container, separate from the org
 * (Organization → Workspace → Project) chain. Flat: personal_project → diagram.
 * Personal has no Asset Catalog / unified knowledge (org-only).
 */
export const personalProject = pgTable(
  "personal_project",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("personal_project_owner_idx").on(t.ownerUserId)],
);
```

- [ ] **Step 3: Make `diagram` parent-polymorphic** — replace the existing `diagram` table definition with:
```tsx
export const diagram = pgTable(
  "diagram",
  {
    id: text("id").primaryKey(),
    // Exactly one parent is set (CHECK below): an org project OR a personal project.
    projectId: text("project_id").references(() => project.id, { onDelete: "cascade" }),
    personalProjectId: text("personal_project_id").references(() => personalProject.id, {
      onDelete: "cascade",
    }),
    type: diagramType("type").notNull().default("bpmn"),
    name: text("name").notNull(),
    content: text("content").notNull().default(""),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("diagram_project_idx").on(t.projectId),
    index("diagram_personal_project_idx").on(t.personalProjectId),
    check(
      "diagram_parent_xor",
      sql`(${t.projectId} IS NULL) <> (${t.personalProjectId} IS NULL)`,
    ),
  ],
);
```
(Note: `projectId` lost `.notNull()` — it is now nullable.)

- [ ] **Step 4: Add the personal AI tables** (near the existing `aiConnection`/`aiOrgDefault`):
```tsx
/** Personal (user-scoped) BYOK AI connection — mirrors ai_connection, keyed by user. */
export const userAiConnection = pgTable(
  "user_ai_connection",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    encryptedKey: text("encrypted_key"),
    baseUrl: text("base_url"),
    defaultModel: text("default_model"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("user_ai_connection_user_idx").on(t.userId),
    uniqueIndex("user_ai_connection_user_provider_unique").on(t.userId, t.provider),
  ],
);

/** The user's personal default-model pointer — mirrors ai_org_default. */
export const userAiDefault = pgTable("user_ai_default", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

- [ ] **Step 5: Export types** (with the other `$inferSelect`/`$inferInsert` exports at the bottom of `app.ts`):
```tsx
export type PersonalProject = typeof personalProject.$inferSelect;
export type NewPersonalProject = typeof personalProject.$inferInsert;
export type UserAiConnection = typeof userAiConnection.$inferSelect;
export type NewUserAiConnection = typeof userAiConnection.$inferInsert;
export type UserAiDefault = typeof userAiDefault.$inferSelect;
export type NewUserAiDefault = typeof userAiDefault.$inferInsert;
```

- [ ] **Step 6: Typecheck the db package + generate the migration**

Run: `pnpm --filter @claril/db typecheck` → PASS.
Run: `pnpm --filter @claril/db db:generate` → produces a new `packages/db/drizzle/00XX_*.sql`. **Inspect it**: it must be additive — `CREATE TABLE personal_project / user_ai_connection / user_ai_default` (+ FKs, indexes, the unique index), `ALTER TABLE "diagram" ADD COLUMN "personal_project_id"`, `ALTER TABLE "diagram" ALTER COLUMN "project_id" DROP NOT NULL`, `ADD CONSTRAINT "diagram_parent_xor" CHECK (...)`, and the new diagram index. **Do NOT** let it drop/rewrite existing data. If drizzle emits anything destructive, stop and report.

- [ ] **Step 7: Commit** (do NOT apply yet — Task 4 applies with authorization)
```bash
git add packages/db/src/schema/app.ts packages/db/drizzle
git commit -m "$(cat <<'EOF'
feat(db): personal subsystem schema — personal_project, user AI config, diagram parent XOR (W13)

Adds personal_project + user_ai_connection/user_ai_default; diagram gains a
nullable personal_project_id with a CHECK that exactly one parent (project_id
XOR personal_project_id) is set. Additive, generate-only migration.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Personal AI resolver (reuse the pure core)

**Files:** `apps/web/lib/ai.ts`

> No new pure logic — the loaders reuse the already-tested `resolveConnection`. Verification is typecheck + the existing `ai.test.ts` staying green.

- [ ] **Step 1: Add the context type + personal loaders + dispatch** to `apps/web/lib/ai.ts` (after `listOrgConnections`):
```tsx
/** Which scope an AI call resolves against. */
export type AiContext = { kind: "personal"; userId: string } | { kind: "org"; orgId: string };

/** Decrypted personal (user-scoped) AI config, or null when nothing usable. */
export async function getUserAiConfig(
  userId: string,
  opts?: AiOverride,
): Promise<LLMProviderConfig | null> {
  const [conns, defRows] = await Promise.all([
    db.select().from(schema.userAiConnection).where(eq(schema.userAiConnection.userId, userId)),
    db
      .select()
      .from(schema.userAiDefault)
      .where(eq(schema.userAiDefault.userId, userId))
      .limit(1),
  ]);
  const def = defRows[0] ? { provider: defRows[0].provider, model: defRows[0].model } : null;
  const resolved = resolveConnection(conns, def, opts);
  if (!resolved) return null;
  return {
    provider: resolved.provider,
    model: resolved.model,
    baseUrl: resolved.baseUrl,
    apiKey: resolved.encryptedKey ? decryptSecret(resolved.encryptedKey) : undefined,
  };
}

/** Personal connections summarized for the (future) settings UI. */
export async function listUserConnections(userId: string): Promise<ConnectionView[]> {
  const [conns, defRows] = await Promise.all([
    db.select().from(schema.userAiConnection).where(eq(schema.userAiConnection.userId, userId)),
    db
      .select()
      .from(schema.userAiDefault)
      .where(eq(schema.userAiDefault.userId, userId))
      .limit(1),
  ]);
  const defaultProvider = defRows[0]?.provider;
  return conns
    .map((c) => ({
      provider: c.provider as AiProvider,
      hasKey: Boolean(c.encryptedKey),
      usable: Boolean(c.encryptedKey) || c.provider === "ollama",
      baseUrl: c.baseUrl ?? undefined,
      defaultModel: c.defaultModel ?? undefined,
      isOrgDefault: c.provider === defaultProvider,
    }))
    .sort((a, b) => a.provider.localeCompare(b.provider));
}

/** Route an AI-config lookup to the personal or org resolver by context. */
export function getAiConfig(ctx: AiContext, opts?: AiOverride): Promise<LLMProviderConfig | null> {
  return ctx.kind === "personal"
    ? getUserAiConfig(ctx.userId, opts)
    : getOrgAiConfig(ctx.orgId, opts);
}
```
(`AiProvider` is already imported in `ai.ts`. The user-table rows are structurally assignable to `ConnRow`, exactly like the org rows already passed to `resolveConnection`.)

- [ ] **Step 2: Verify** — `cd apps/web && pnpm exec vitest run lib/ai.test.ts lib/ai-providers.test.ts` → PASS (unchanged core). From repo root: `pnpm --filter web typecheck` → PASS.

- [ ] **Step 3: Commit**
```bash
git add apps/web/lib/ai.ts
git commit -m "$(cat <<'EOF'
feat(web): personal AI resolver — getUserAiConfig/listUserConnections + AiContext (W13)

Personal (user-scoped) AI config reusing the pure resolveConnection core; a
getAiConfig(ctx) dispatch routes personal vs org. No org-path changes.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Diagram-parent + access helpers + nullable-`projectId` ripple

**Files:** `apps/web/lib/tenancy.ts`, `apps/web/lib/tenancy.test.ts` (new), `apps/web/lib/diagram-actions.ts`

- [ ] **Step 1: Write the failing test** — `apps/web/lib/tenancy.test.ts`:
```tsx
import { describe, expect, it } from "vitest";
import { diagramParent } from "./tenancy";

describe("diagramParent", () => {
  it("resolves an org-project parent", () => {
    expect(diagramParent({ projectId: "p1", personalProjectId: null })).toEqual({
      kind: "org",
      projectId: "p1",
    });
  });
  it("resolves a personal-project parent", () => {
    expect(diagramParent({ projectId: null, personalProjectId: "pp1" })).toEqual({
      kind: "personal",
      personalProjectId: "pp1",
    });
  });
  it("throws when neither parent is set", () => {
    expect(() => diagramParent({ projectId: null, personalProjectId: null })).toThrow();
  });
  it("throws when both parents are set", () => {
    expect(() => diagramParent({ projectId: "p1", personalProjectId: "pp1" })).toThrow();
  });
});
```

- [ ] **Step 2: Run it; confirm FAIL** — `cd apps/web && pnpm exec vitest run lib/tenancy.test.ts` → FAIL (`diagramParent` not exported).

- [ ] **Step 3: Implement the pure helper + access functions** in `apps/web/lib/tenancy.ts`. Add the pure helper near the top (after imports):
```tsx
/** The XOR parent of a diagram. */
export type DiagramParent =
  | { kind: "org"; projectId: string }
  | { kind: "personal"; personalProjectId: string };

/** Pure: resolve a diagram's single parent, or throw if not exactly one is set. */
export function diagramParent(d: {
  projectId: string | null;
  personalProjectId: string | null;
}): DiagramParent {
  const hasOrg = Boolean(d.projectId);
  const hasPersonal = Boolean(d.personalProjectId);
  if (hasOrg === hasPersonal) {
    throw new Error("Diagram must have exactly one parent (project XOR personal_project)");
  }
  return hasOrg
    ? { kind: "org", projectId: d.projectId as string }
    : { kind: "personal", personalProjectId: d.personalProjectId as string };
}
```
Add the personal access assertion:
```tsx
/** Assert the user owns the given personal project. Throws if not. */
export async function assertPersonalProjectAccess(
  userId: string,
  personalProjectId: string,
): Promise<void> {
  const rows = await db
    .select({ id: schema.personalProject.id })
    .from(schema.personalProject)
    .where(
      and(
        eq(schema.personalProject.id, personalProjectId),
        eq(schema.personalProject.ownerUserId, userId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw new Error("Forbidden");
}
```
Replace the body of `assertDiagramAccess` so it resolves the XOR parent and returns a discriminated result (callers can derive AI context + whether the catalog applies). Keep it throwing on no access:
```tsx
export type DiagramAccess =
  | { kind: "org"; projectId: string; workspaceId: string }
  | { kind: "personal"; personalProjectId: string };

/**
 * Assert the user may access the diagram and return its parent context.
 * Org diagrams resolve via project → workspace → workspaceMember; personal
 * diagrams via sole ownership.
 */
export async function assertDiagramAccess(
  userId: string,
  diagramId: string,
): Promise<DiagramAccess> {
  const rows = await db
    .select({
      projectId: schema.diagram.projectId,
      personalProjectId: schema.diagram.personalProjectId,
    })
    .from(schema.diagram)
    .where(eq(schema.diagram.id, diagramId))
    .limit(1);
  if (!rows[0]) throw new Error("Not found");
  const parent = diagramParent(rows[0]);

  if (parent.kind === "personal") {
    await assertPersonalProjectAccess(userId, parent.personalProjectId);
    return { kind: "personal", personalProjectId: parent.personalProjectId };
  }
  const workspaceId = await assertProjectAccess(userId, parent.projectId);
  return { kind: "org", projectId: parent.projectId, workspaceId };
}
```
> `assertProjectAccess` already returns the `workspaceId` and throws on no access — reuse it unchanged. If any existing caller used `assertDiagramAccess`'s old `string` (projectId) return, update it to read `.projectId` off the org branch (grep for callers; today it returned the projectId string).

- [ ] **Step 4: Fix the nullable-`projectId` ripple** in `apps/web/lib/diagram-actions.ts`: the org dashboard listing groups diagrams by `projectId`, now `string | null`. Skip parentless-to-org rows (personal diagrams never appear in the org dashboard). In the diagram-list loop, add a guard:
```tsx
    if (!d.projectId) continue; // personal diagrams aren't listed in the org dashboard
    if (!projectIds.includes(d.projectId)) continue;
```
(Place the `!d.projectId` guard immediately before the existing `projectIds.includes` check at ~line 64.) `projectIdForDiagram` in `ai-usage.ts` already returns `rows[0]?.projectId ?? null` — null-safe, no change. `createDiagram` still sets `projectId` (org path) — unchanged.

- [ ] **Step 5: Run tests + typecheck** — `cd apps/web && pnpm exec vitest run lib/tenancy.test.ts` → PASS. From repo root `pnpm --filter web typecheck` → PASS (fix any remaining `projectId`-nullable type errors the compiler flags by routing through `diagramParent` or a null guard — do NOT broaden types with `!` unless the XOR guarantees it).

- [ ] **Step 6: Commit**
```bash
git add apps/web/lib/tenancy.ts apps/web/lib/tenancy.test.ts apps/web/lib/diagram-actions.ts
git commit -m "$(cat <<'EOF'
feat(web): diagram-parent XOR helper + personal access + nullable projectId ripple (W13)

Pure diagramParent() (unit-tested); assertPersonalProjectAccess; assertDiagramAccess
now returns a discriminated org/personal context. Org dashboard listing skips
personal diagrams. No behavior change (no personal diagrams exist yet).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Apply migration + final verification

**Files:** none (DB + integration).

- [ ] **Step 1: Full verification on the branch**
- `pnpm --filter @claril/db typecheck` → PASS
- `pnpm --filter web typecheck` → PASS
- `pnpm --filter web build` → PASS
- `cd apps/web && pnpm exec vitest run lib/ai.test.ts lib/ai-providers.test.ts lib/tenancy.test.ts` → PASS
- `pnpm -r test` (package suites) → PASS

- [ ] **Step 2: Apply the migration (with explicit user authorization)** — additive only. Run `pnpm --filter @claril/db db:migrate` against the configured `DATABASE_URL` (Neon prod, confirmed single DB). Confirm the new tables + diagram column/constraint exist and the run is clean. (Do not echo `DATABASE_URL`.)

- [ ] **Step 3: Sanity** — confirm existing diagrams still load (all have `project_id` set, satisfying the XOR check) and the app boots. Nothing user-facing changed.

---

## Self-Review
- **Spec coverage:** schema (Task 1), additive migration (Task 1 generate / Task 4 apply), personal AI resolver reusing the pure core (Task 2), pure `diagramParent` + personal/org access + ripple (Task 3), verification + dark apply (Task 4). ✓
- **Placeholders:** none — full schema, resolver, and access code given; ripple sites enumerated.
- **Type consistency:** `AiContext`/`ConnectionView`/`AiOverride`/`ConnRow` reused from W8 verbatim; `DiagramParent`/`DiagramAccess` defined once in tenancy.ts and consumed by `assertDiagramAccess`; `diagramParent` signature matches its test.
- **Invariants:** additive + reversible migration; XOR enforced at DB (CHECK) and in code (pure helper); reuses crypto + the W8 resolver (no duplicated AI logic); org paths untouched; ships dark (no personal rows created → all current flows unchanged).
- **Deferred (per spec):** `workspaceRole` enum values, all UX, legacy data migration.
