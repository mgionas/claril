/**
 * Asset Catalog — an org-level, Jira-Assets/Insight-style CMDB of reusable
 * typed objects ("assets") with custom fields, bound to diagram elements.
 *
 * Tenancy: every row is org-scoped (the Org tier = Better Auth `organization`).
 * Assets are shared across all of an org's workspaces/projects and are the
 * single source of truth that diagram elements reference instead of re-describe.
 *
 *   assetType              { orgId, name, icon/color, description, fieldSchema }
 *   asset                  { orgId, assetTypeId, name, description, values }
 *   assetLink              { fromAssetId -> toAssetId, relationType }   (CMDB graph)
 *   elementAssetBinding    { diagramId, elementId } -> assetId          (traceability)
 *
 * `fieldSchema` and `values` are jsonb validated with a Zod schema derived at
 * runtime from `fieldSchema` (schema-on-read — see ./catalog-fields.ts).
 */
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { diagram } from "./app";
import type { FieldDef, FieldValues } from "./catalog-fields";

/**
 * An org-scoped object type (Service, System, Data Object, Actor, or a
 * user-defined type). `fieldSchema` declares the custom fields whose values
 * each asset of this type carries.
 */
export const assetType = pgTable(
  "asset_type",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Lucide icon name (e.g. "server", "box", "database", "user"). */
    icon: text("icon"),
    /** Accent color token or hex used in the catalog UI / legends. */
    color: text("color"),
    description: text("description"),
    /** true for built-in types (Service/System/Data Object/Actor). */
    builtin: text("builtin").notNull().default("false"),
    /** Custom-field definitions; validated by FieldDef[] at the boundary. */
    fieldSchema: jsonb("field_schema").$type<FieldDef[]>().notNull().default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("asset_type_org_idx").on(t.organizationId),
    uniqueIndex("asset_type_org_name_unique").on(t.organizationId, t.name),
  ],
);

/**
 * A concrete asset (an instance of an asset type). `values` holds the custom
 * field values, validated schema-on-read against the type's `fieldSchema`.
 */
export const asset = pgTable(
  "asset",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    assetTypeId: text("asset_type_id")
      .notNull()
      .references(() => assetType.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** Custom-field values keyed by FieldDef.key; validated at the boundary. */
    values: jsonb("values").$type<FieldValues>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("asset_org_idx").on(t.organizationId),
    index("asset_type_idx").on(t.assetTypeId),
  ],
);

/**
 * A typed, directed reference between two assets (the CMDB graph), e.g.
 * "depends-on", "owned-by", "exposes". Both endpoints are org-scoped; the
 * action layer enforces that both belong to the same org.
 */
export const assetLink = pgTable(
  "asset_link",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    fromAssetId: text("from_asset_id")
      .notNull()
      .references(() => asset.id, { onDelete: "cascade" }),
    toAssetId: text("to_asset_id")
      .notNull()
      .references(() => asset.id, { onDelete: "cascade" }),
    /** e.g. "depends-on" | "owned-by" | "exposes" | "relates-to". */
    relationType: text("relation_type").notNull().default("relates-to"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("asset_link_org_idx").on(t.organizationId),
    index("asset_link_from_idx").on(t.fromAssetId),
    index("asset_link_to_idx").on(t.toAssetId),
    uniqueIndex("asset_link_unique").on(t.fromAssetId, t.toAssetId, t.relationType),
  ],
);

/**
 * Binds a diagram element (a bpmn-js element id within a diagram) to an asset.
 * Enables cross-diagram traceability and impact analysis ("what uses asset X?")
 * and AI grounding (resolve a shape -> its real service semantics).
 *
 * `organizationId` is denormalized for fast, strictly org-scoped queries and a
 * defense-in-depth tenancy check; the action layer keeps it consistent with
 * the asset and the diagram's org.
 */
export const elementAssetBinding = pgTable(
  "element_asset_binding",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    diagramId: text("diagram_id")
      .notNull()
      .references(() => diagram.id, { onDelete: "cascade" }),
    /** bpmn-js element id (e.g. "Activity_1abc"). */
    elementId: text("element_id").notNull(),
    assetId: text("asset_id")
      .notNull()
      .references(() => asset.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("element_binding_org_idx").on(t.organizationId),
    index("element_binding_diagram_idx").on(t.diagramId),
    index("element_binding_asset_idx").on(t.assetId),
    // One asset per (diagram, element). Re-binding replaces; multiple assets
    // per element is intentionally out of scope for the foundation.
    uniqueIndex("element_binding_unique").on(t.diagramId, t.elementId),
  ],
);

export type AssetType = typeof assetType.$inferSelect;
export type NewAssetType = typeof assetType.$inferInsert;
export type Asset = typeof asset.$inferSelect;
export type NewAsset = typeof asset.$inferInsert;
export type AssetLink = typeof assetLink.$inferSelect;
export type NewAssetLink = typeof assetLink.$inferInsert;
export type ElementAssetBinding = typeof elementAssetBinding.$inferSelect;
export type NewElementAssetBinding = typeof elementAssetBinding.$inferInsert;
