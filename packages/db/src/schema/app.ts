/**
 * Claril domain schema. Tenancy: Organization → Workspace → Project → Diagram
 * → Version. `organization` (the Org tier) and `user` come from Better Auth
 * (see ./auth). Asset Catalog tables are added in a later phase.
 */
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

export const diagramType = pgEnum("diagram_type", ["bpmn", "sequence", "c4"]);
export const workspaceRole = pgEnum("workspace_role", ["admin", "member"]);
export const projectRole = pgEnum("project_role", ["owner", "editor", "viewer"]);

export const workspace = pgTable(
  "workspace",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("workspace_org_idx").on(t.organizationId)],
);

export const workspaceMember = pgTable(
  "workspace_member",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: workspaceRole("role").notNull().default("member"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("workspace_member_unique").on(t.workspaceId, t.userId)],
);

export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("project_workspace_idx").on(t.workspaceId)],
);

export const projectMember = pgTable(
  "project_member",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: projectRole("role").notNull().default("viewer"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("project_member_unique").on(t.projectId, t.userId)],
);

export const diagram = pgTable(
  "diagram",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    type: diagramType("type").notNull().default("bpmn"),
    name: text("name").notNull(),
    // BPMN XML (source of truth) / Mermaid / C4 DSL depending on type.
    content: text("content").notNull().default(""),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("diagram_project_idx").on(t.projectId)],
);

export const version = pgTable(
  "version",
  {
    id: text("id").primaryKey(),
    diagramId: text("diagram_id")
      .notNull()
      .references(() => diagram.id, { onDelete: "cascade" }),
    label: text("label"),
    content: text("content").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("version_diagram_idx").on(t.diagramId)],
);

/**
 * Brand-agnostic, BYOK AI provider config — one per Organization. The API key
 * is stored encrypted (AES-256-GCM); never in plaintext. AI features are off
 * when this row is absent (or has no key for cloud providers).
 *
 * @deprecated Superseded by `aiConnection` (multi-provider) + `aiOrgDefault`
 * (the org's default model pointer). This single-row-per-org table is kept in
 * place only so the live app keeps working until the follow-up wiring switches
 * `getOrgAiConfig` / the advisor actions over to the new tables. A later
 * cleanup migration drops it once that wiring lands — see
 * `docs/multi-provider-ai.md`. Do not add new readers/writers of this table.
 */
export const aiProviderConfig = pgTable("ai_provider_config", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .unique()
    .references(() => organization.id, { onDelete: "cascade" }),
  // anthropic | openai | google | mistral | ollama
  provider: text("provider").notNull(),
  model: text("model"),
  baseUrl: text("base_url"),
  encryptedKey: text("encrypted_key"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* ---- Multi-provider AI (BYOK) ---- */

/**
 * One connected AI provider per (organization, provider). An org may connect
 * several providers at once (Anthropic + OpenAI + Google …) and switch between
 * their models. Replaces the single-row `aiProviderConfig` above.
 *
 * - `provider` is free-form text matching the `AiProvider` union in
 *   `@claril/ai-advisor` (anthropic | openai | google | mistral | ollama). We
 *   keep it `text` (not a pgEnum) to mirror the existing `ai_provider_config`
 *   convention and to avoid an ALTER-TYPE migration every time a provider is
 *   added; validation happens at the boundary with Zod.
 * - `encryptedKey` is the BYOK key, AES-256-GCM encrypted (see
 *   `apps/web/lib/crypto.ts`); nullable because local providers (Ollama) need
 *   none. AI for a provider is usable when it has a key OR is `ollama`.
 * - `defaultModel` is the model this provider uses when selected — callers seed
 *   it from `DEFAULT_MODELS[provider]` so it is always a concrete model id.
 * - `baseUrl` is an optional self-hosted / proxy / Ollama endpoint override.
 */
export const aiConnection = pgTable(
  "ai_connection",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // anthropic | openai | google | mistral | ollama
    provider: text("provider").notNull(),
    encryptedKey: text("encrypted_key"),
    baseUrl: text("base_url"),
    defaultModel: text("default_model"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("ai_connection_org_idx").on(t.organizationId),
    uniqueIndex("ai_connection_org_provider_unique").on(t.organizationId, t.provider),
  ],
);

/**
 * The org-level default-model pointer: "which connected provider + model the
 * advisor uses when a run doesn't specify an override".
 *
 * Design choice — a dedicated single-row-per-org table (PK = organizationId)
 * rather than an `isDefault` flag on `aiConnection`:
 *  - The default is an org property, not a per-connection one; a separate table
 *    makes "exactly one default per org" structurally true (the PK enforces it)
 *    with no partial-unique-index gymnastics and no risk of two connections
 *    both being flagged default.
 *  - It can name a `(provider, model)` pair where `model` differs from that
 *    connection's `defaultModel` (e.g. the org default is a cheaper model than
 *    the connection's preferred one) without overloading the connection row.
 *  - It is cheap to read and update atomically, and trivially nullable: no row
 *    means "no org default yet" (advisor falls back to the sole connection, or
 *    errors if none).
 *
 * `provider` should match a connected provider for the org (logical reference
 * to `aiConnection` by (organizationId, provider)); we do not add a composite
 * FK — the follow-up action layer enforces it and must clear/repoint this row
 * when the referenced connection is removed.
 */
export const aiOrgDefault = pgTable("ai_org_default", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  // Must match a connected provider for this org (anthropic | openai | …).
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AiConnection = typeof aiConnection.$inferSelect;
export type NewAiConnection = typeof aiConnection.$inferInsert;
export type AiOrgDefault = typeof aiOrgDefault.$inferSelect;
export type NewAiOrgDefault = typeof aiOrgDefault.$inferInsert;
