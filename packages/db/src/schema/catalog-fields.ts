/**
 * Custom-schema engine for the Asset Catalog (schema-on-read).
 *
 * An asset type's `fieldSchema` is a list of {@link FieldDef}. At runtime we
 * derive a Zod schema from it to validate an asset's `values`. This keeps the
 * field set fully data-driven (user-defined types come later) while still
 * giving us strict validation at every write boundary.
 *
 * Pure module — no DB / framework imports — so it is safe to use on the server
 * (actions) and to feed the AI grounding layer.
 */
import { z } from "zod";

/** Field kinds supported by the custom-schema engine. */
export type FieldType =
  | "text"
  | "number"
  | "select"
  | "reference" // points at another asset (stores its id)
  | "url"
  | "owner" // a person/team identifier (free text for now)
  | "tags"; // list of short labels

/** One declared custom field on an asset type. */
export interface FieldDef {
  /** Stable machine key used in `asset.values`. */
  key: string;
  /** Human label shown in the UI. */
  label: string;
  type: FieldType;
  required?: boolean;
  /** Allowed options for `select`. */
  options?: string[];
  /** Optional helper text. */
  description?: string;
}

/** A validated map of field key -> value. */
export type FieldValue = string | number | string[] | null;
export type FieldValues = Record<string, FieldValue>;

/** Zod schema for a single FieldDef (used to validate `fieldSchema` itself). */
export const fieldDefSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "key must be alphanumeric/underscore"),
  label: z.string().min(1),
  type: z.enum(["text", "number", "select", "reference", "url", "owner", "tags"]),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  description: z.string().optional(),
});

export const fieldSchemaSchema = z.array(fieldDefSchema);

/** Validate a raw `fieldSchema` payload (e.g. from a form) into FieldDef[]. */
export function parseFieldSchema(input: unknown): FieldDef[] {
  return fieldSchemaSchema.parse(input) as FieldDef[];
}

/** Build the Zod validator for one field's value. */
function zodForField(field: FieldDef): z.ZodTypeAny {
  let base: z.ZodTypeAny;
  switch (field.type) {
    case "number":
      base = z.number();
      break;
    case "tags":
      base = z.array(z.string());
      break;
    case "select":
      base =
        field.options && field.options.length > 0
          ? z.enum(field.options as [string, ...string[]])
          : z.string();
      break;
    case "url":
      base = z.string().url();
      break;
    case "reference":
    case "owner":
    case "text":
    default:
      base = z.string();
      break;
  }
  if (!field.required) {
    // Optional fields may be omitted or explicitly null/empty.
    base = base.nullish();
  }
  return base;
}

/**
 * Derive a Zod object schema from an asset type's field schema. Unknown keys
 * are stripped (schema-on-read tolerates legacy/extra data). Empty strings for
 * optional fields are coerced to null so the UI can submit blank inputs.
 */
export function deriveValuesSchema(fieldSchema: FieldDef[]): z.ZodType<FieldValues> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fieldSchema) {
    shape[field.key] = zodForField(field);
  }
  return z.object(shape).strip() as unknown as z.ZodType<FieldValues>;
}

/**
 * Normalize raw form values before validation: drop empty strings/arrays for
 * optional fields, coerce numeric strings to numbers.
 */
function normalizeValues(fieldSchema: FieldDef[], raw: Record<string, unknown>): FieldValues {
  const out: FieldValues = {};
  for (const field of fieldSchema) {
    const v = raw[field.key];
    if (v === undefined) continue;
    if (field.type === "number") {
      if (v === "" || v === null) {
        if (!field.required) continue;
        out[field.key] = v as never;
      } else {
        out[field.key] = typeof v === "string" ? Number(v) : (v as number);
      }
      continue;
    }
    if (field.type === "tags") {
      if (Array.isArray(v)) out[field.key] = v.map(String);
      else if (typeof v === "string" && v.trim().length > 0) {
        out[field.key] = v.split(",").map((s) => s.trim()).filter(Boolean);
      } else if (field.required) {
        out[field.key] = [];
      }
      continue;
    }
    if ((v === "" || v === null) && !field.required) continue;
    out[field.key] = v as FieldValue;
  }
  return out;
}

export interface ValidateResult {
  ok: boolean;
  values?: FieldValues;
  errors?: string[];
}

/**
 * Validate (and normalize) an asset's raw values against a field schema.
 * Returns the cleaned values on success, or a flat list of error messages.
 */
export function validateAssetValues(
  fieldSchema: FieldDef[],
  raw: Record<string, unknown>,
): ValidateResult {
  const normalized = normalizeValues(fieldSchema, raw);
  const result = deriveValuesSchema(fieldSchema).safeParse(normalized);
  if (result.success) {
    return { ok: true, values: result.data };
  }
  return {
    ok: false,
    errors: result.error.issues.map((i) => `${i.path.join(".") || "?"}: ${i.message}`),
  };
}

/** The four built-in asset types shipped first (Phase A). */
export const BUILTIN_ASSET_TYPES: ReadonlyArray<{
  name: string;
  icon: string;
  color: string;
  description: string;
  fieldSchema: FieldDef[];
}> = [
  {
    name: "Service",
    icon: "server",
    color: "#4d8dff",
    description: "A deployable service or API with capabilities and ownership.",
    fieldSchema: [
      { key: "owner", label: "Owner", type: "owner" },
      { key: "capabilities", label: "Capabilities", type: "tags" },
      { key: "sla", label: "SLA", type: "text" },
      { key: "url", label: "Docs / Endpoint", type: "url" },
    ],
  },
  {
    name: "System",
    icon: "box",
    color: "#34d399",
    description: "A larger system or application boundary.",
    fieldSchema: [
      { key: "owner", label: "Owner", type: "owner" },
      {
        key: "lifecycle",
        label: "Lifecycle",
        type: "select",
        options: ["planned", "active", "deprecated", "retired"],
      },
    ],
  },
  {
    name: "Data Object",
    icon: "database",
    color: "#fbbf24",
    description: "A data entity that flows through processes.",
    fieldSchema: [
      {
        key: "classification",
        label: "Classification",
        type: "select",
        options: ["public", "internal", "confidential", "pii"],
      },
      { key: "owner", label: "Owner", type: "owner" },
    ],
  },
  {
    name: "Actor",
    icon: "user",
    color: "#a1a1aa",
    description: "A human role or external party participating in a process.",
    fieldSchema: [{ key: "kind", label: "Kind", type: "select", options: ["person", "team", "external"] }],
  },
];
