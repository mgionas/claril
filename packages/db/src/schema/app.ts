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
