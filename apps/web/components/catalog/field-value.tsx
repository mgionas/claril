import Link from "next/link";
import type { Asset, FieldDef } from "@claril/db";
import { Badge } from "@/components/ui/badge";

/**
 * Render one asset field value formatted by its {@link FieldDef.type}:
 *   text/number  -> plain text
 *   url          -> external link
 *   owner        -> a person/team chip
 *   tags         -> chips
 *   select       -> chip
 *   reference    -> link to the referenced asset (if resolvable in `resolve`)
 *
 * `resolve` is an optional id->Asset map so reference fields can show the target
 * asset's name and link to its detail page; falls back to the raw id.
 */
export function FieldValueView({
  field,
  value,
  resolve,
}: {
  field: FieldDef;
  value: unknown;
  resolve?: Map<string, Asset>;
}) {
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) {
    return <span className="text-fg-subtle">—</span>;
  }

  switch (field.type) {
    case "url": {
      const href = String(value);
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="text-accent underline-offset-2 hover:underline"
        >
          {href}
        </a>
      );
    }
    case "owner":
      return (
        <Badge variant="secondary" className="font-normal">
          {String(value)}
        </Badge>
      );
    case "select":
      return (
        <Badge variant="outline" className="font-normal">
          {String(value)}
        </Badge>
      );
    case "tags": {
      const tags = Array.isArray(value) ? (value as string[]) : [String(value)];
      return (
        <span className="flex flex-wrap gap-1">
          {tags.map((t) => (
            <Badge key={t} variant="secondary" className="font-normal">
              {t}
            </Badge>
          ))}
        </span>
      );
    }
    case "reference": {
      const id = String(value);
      const target = resolve?.get(id);
      if (target) {
        return (
          <Link
            href={`/catalog/${target.id}`}
            className="text-accent underline-offset-2 hover:underline"
          >
            {target.name}
          </Link>
        );
      }
      return <span className="font-mono text-xs text-fg-muted">{id}</span>;
    }
    default:
      return <span className="text-fg">{String(value)}</span>;
  }
}

/** A compact one-line summary of the populated fields (for listing rows). */
export function summarizeValues(schema: FieldDef[], values: unknown): string {
  const v = (values ?? {}) as Record<string, unknown>;
  const parts = schema
    .map((f) => {
      const raw = v[f.key];
      if (raw == null || raw === "" || (Array.isArray(raw) && raw.length === 0)) return null;
      const text = Array.isArray(raw) ? raw.join(", ") : String(raw);
      return `${f.label}: ${text}`;
    })
    .filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : "";
}
