"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Boxes, Layers, Loader2, Plus, Settings2, Sparkles } from "lucide-react";
import type { Asset, AssetType, FieldDef, FieldType } from "@claril/db";
import {
  createAssetType,
  updateAssetType,
  deleteAssetType,
  ensureBuiltinAssetTypes,
  createAsset,
  updateAsset,
} from "@/lib/catalog-actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TypeChip } from "@/components/catalog/type-chip";
import { summarizeValues } from "@/components/catalog/field-value";

const FIELD_TYPES: FieldType[] = [
  "text",
  "number",
  "select",
  "reference",
  "url",
  "owner",
  "tags",
];

const fieldClass =
  "rounded-[6px] border border-hairline bg-elevated px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-accent";
const btnPrimary =
  "rounded-[6px] bg-accent px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50";
const btnGhost =
  "rounded-[6px] px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-elevated";

const ALL = "__all__";

interface Props {
  initialTypes: AssetType[];
  initialAssets: Asset[];
  /** assetId -> number of diagram-element bindings referencing it. */
  usageCounts?: Record<string, number>;
}

export function CatalogAdmin({ initialTypes, initialAssets, usageCounts = {} }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<string>(ALL);
  const [typeEditor, setTypeEditor] = useState<AssetType | "new" | null>(null);
  const [assetEditor, setAssetEditor] = useState<Asset | "new" | null>(null);

  const typeById = useMemo(
    () => new Map(initialTypes.map((t) => [t.id, t])),
    [initialTypes],
  );

  const countsByType = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of initialAssets) m.set(a.assetTypeId, (m.get(a.assetTypeId) ?? 0) + 1);
    return m;
  }, [initialAssets]);

  const selectedType =
    selectedTypeId === ALL ? null : typeById.get(selectedTypeId) ?? null;

  const visibleAssets = useMemo(
    () =>
      selectedTypeId === ALL
        ? initialAssets
        : initialAssets.filter((a) => a.assetTypeId === selectedTypeId),
    [initialAssets, selectedTypeId],
  );

  // For the asset editor we need a concrete type. When "All" is selected, fall
  // back to the first type so "New asset" still works.
  const editorType = selectedType ?? initialTypes[0] ?? null;

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed.");
      }
    });
  }

  const hasTypes = initialTypes.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Asset Catalog</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Org-level CMDB — reusable typed objects that diagram elements reference instead
            of re-describe.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setTypeEditor("new")}>
            <Settings2 className="size-4" />
            <span className="hidden sm:inline">Manage types</span>
          </Button>
          <Button
            size="sm"
            disabled={!editorType}
            onClick={() => setAssetEditor("new")}
          >
            <Plus className="size-4" />
            New asset
          </Button>
        </div>
      </header>

      {error && (
        <p className="rounded-[6px] border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
          {error}
        </p>
      )}

      {!hasTypes ? (
        <EmptyTypes
          pending={pending}
          onSeed={() => run(() => ensureBuiltinAssetTypes())}
          onCreate={() => setTypeEditor("new")}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr]">
          {/* Type rail / filter */}
          <aside className="flex flex-col gap-1">
            <div className="mb-1 flex items-center justify-between px-1">
              <h2 className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
                Object types
              </h2>
              <button
                className="text-xs text-fg-subtle transition-colors hover:text-fg"
                onClick={() => setTypeEditor("new")}
              >
                + New
              </button>
            </div>

            <TypeRailItem
              label="All assets"
              count={initialAssets.length}
              active={selectedTypeId === ALL}
              onClick={() => setSelectedTypeId(ALL)}
              dot={null}
            />
            {initialTypes.map((t) => (
              <TypeRailItem
                key={t.id}
                label={t.name}
                count={countsByType.get(t.id) ?? 0}
                active={selectedTypeId === t.id}
                onClick={() => setSelectedTypeId(t.id)}
                dot={t.color ?? "#71717a"}
                builtin={t.builtin === "true"}
              />
            ))}
          </aside>

          {/* Assets table */}
          <section className="flex flex-col gap-3">
            {selectedType && (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-medium">{selectedType.name}</h2>
                  {selectedType.description && (
                    <p className="text-sm text-fg-muted">{selectedType.description}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-fg-muted"
                  onClick={() => setTypeEditor(selectedType)}
                >
                  <Settings2 className="size-4" />
                  Edit type
                </Button>
              </div>
            )}

            {visibleAssets.length === 0 ? (
              <EmptyAssets
                onCreate={() => editorType && setAssetEditor("new")}
                disabled={!editorType}
              />
            ) : (
              <div className="overflow-hidden rounded-[10px] border border-hairline">
                <table className="w-full text-sm">
                  <thead className="bg-panel/60 text-left text-xs text-fg-subtle">
                    <tr>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="hidden px-3 py-2 font-medium sm:table-cell">Type</th>
                      <th className="hidden px-3 py-2 font-medium lg:table-cell">Fields</th>
                      <th className="px-3 py-2 text-right font-medium">Used in</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAssets.map((a) => {
                      const type = typeById.get(a.assetTypeId);
                      const summary = summarizeValues(
                        (type?.fieldSchema as FieldDef[]) ?? [],
                        a.values,
                      );
                      const usage = usageCounts[a.id] ?? 0;
                      return (
                        <tr
                          key={a.id}
                          className="group border-t border-hairline transition-colors hover:bg-elevated/40"
                        >
                          <td className="px-3 py-2.5">
                            <Link
                              href={`/catalog/${a.id}`}
                              className="font-medium text-fg transition-colors group-hover:text-accent"
                            >
                              {a.name}
                            </Link>
                            {a.description && (
                              <div className="truncate text-xs text-fg-subtle">
                                {a.description}
                              </div>
                            )}
                          </td>
                          <td className="hidden px-3 py-2.5 sm:table-cell">
                            <TypeChip type={type} />
                          </td>
                          <td className="hidden max-w-xs truncate px-3 py-2.5 text-fg-muted lg:table-cell">
                            {summary || "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span
                              className={cn(
                                "inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] tabular-nums",
                                usage > 0
                                  ? "bg-accent/15 text-accent"
                                  : "bg-elevated text-fg-subtle",
                              )}
                              title={`${usage} diagram element(s)`}
                            >
                              {usage}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {typeEditor && (
        <TypeEditor
          value={typeEditor === "new" ? null : typeEditor}
          pending={pending}
          onClose={() => setTypeEditor(null)}
          onSubmit={(input) =>
            run(async () => {
              if (typeEditor === "new") {
                const created = await createAssetType(input);
                setSelectedTypeId(created.id);
              } else {
                await updateAssetType(typeEditor.id, input);
              }
              setTypeEditor(null);
            })
          }
          onDelete={
            typeEditor === "new"
              ? undefined
              : () =>
                  run(async () => {
                    await deleteAssetType(typeEditor.id);
                    setSelectedTypeId(ALL);
                    setTypeEditor(null);
                  })
          }
        />
      )}

      {assetEditor && editorType && (
        <AssetEditor
          type={editorType}
          value={assetEditor === "new" ? null : assetEditor}
          pending={pending}
          onClose={() => setAssetEditor(null)}
          onSubmit={(input) =>
            run(async () => {
              if (assetEditor === "new") {
                await createAsset(input);
              } else {
                await updateAsset(assetEditor.id, input);
              }
              setAssetEditor(null);
            })
          }
        />
      )}
    </div>
  );
}

function TypeRailItem({
  label,
  count,
  active,
  onClick,
  dot,
  builtin,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  dot: string | null;
  builtin?: boolean;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-sm transition-colors",
        active ? "bg-elevated text-fg" : "text-fg-muted hover:bg-elevated/60",
      )}
    >
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        {dot ? (
          <span
            className="inline-block size-2 shrink-0 rounded-full"
            style={{ background: dot }}
          />
        ) : (
          <Layers className="size-3.5 shrink-0 text-fg-subtle" />
        )}
        <span className="truncate">{label}</span>
        {builtin && (
          <span className="shrink-0 text-[9px] uppercase tracking-wide text-fg-subtle">
            built-in
          </span>
        )}
      </button>
      <span className="shrink-0 rounded-full bg-canvas px-1.5 text-[11px] tabular-nums text-fg-subtle">
        {count}
      </span>
    </div>
  );
}

function EmptyTypes({
  pending,
  onSeed,
  onCreate,
}: {
  pending: boolean;
  onSeed: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[10px] border border-dashed border-hairline bg-panel/40 px-6 py-20 text-center">
      <span className="grid size-12 place-items-center rounded-[10px] bg-elevated text-fg-subtle">
        <Boxes className="size-6" />
      </span>
      <p className="mt-4 text-sm font-medium">No object types yet</p>
      <p className="mt-1 max-w-sm text-sm text-fg-muted">
        Seed the built-in types (Service, System, Data Object, Actor) to get started, or
        define your own.
      </p>
      <div className="mt-5 flex gap-2">
        <Button onClick={onSeed} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          Seed built-in types
        </Button>
        <Button variant="outline" onClick={onCreate}>
          <Plus className="size-4" />
          New type
        </Button>
      </div>
    </div>
  );
}

function EmptyAssets({
  onCreate,
  disabled,
}: {
  onCreate: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[10px] border border-dashed border-hairline bg-panel/40 px-6 py-16 text-center">
      <span className="grid size-10 place-items-center rounded-[10px] bg-elevated text-fg-subtle">
        <Plus className="size-5" />
      </span>
      <p className="mt-3 text-sm font-medium">No assets here yet</p>
      <p className="mt-1 max-w-xs text-sm text-fg-muted">
        Create a reusable asset that your diagram elements can bind to.
      </p>
      <Button className="mt-4" onClick={onCreate} disabled={disabled}>
        <Plus className="size-4" />
        New asset
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Type editor                                                                */
/* -------------------------------------------------------------------------- */

interface TypeEditorProps {
  value: AssetType | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    icon?: string;
    color?: string;
    description?: string;
    fieldSchema: FieldDef[];
  }) => void;
  onDelete?: () => void;
}

function TypeEditor({ value, pending, onClose, onSubmit, onDelete }: TypeEditorProps) {
  const [name, setName] = useState(value?.name ?? "");
  const [icon, setIcon] = useState(value?.icon ?? "");
  const [color, setColor] = useState(value?.color ?? "#4d8dff");
  const [description, setDescription] = useState(value?.description ?? "");
  const [fields, setFields] = useState<FieldDef[]>(
    (value?.fieldSchema as FieldDef[] | undefined)?.slice() ?? [],
  );

  function updateField(i: number, patch: Partial<FieldDef>) {
    setFields((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function addField() {
    setFields((f) => [...f, { key: `field_${f.length + 1}`, label: "", type: "text" }]);
  }
  function removeField(i: number) {
    setFields((f) => f.filter((_, idx) => idx !== i));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      name,
      icon: icon || undefined,
      color: color || undefined,
      description: description || undefined,
      fieldSchema: fields.map((f) => ({
        ...f,
        options:
          f.type === "select" && typeof (f.options as unknown) === "string"
            ? String(f.options).split(",").map((s) => s.trim()).filter(Boolean)
            : f.options,
      })),
    });
  }

  return (
    <Modal onClose={onClose} title={value ? "Edit object type" : "New object type"}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Name">
            <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} required />
          </Labeled>
          <Labeled label="Color">
            <input
              type="color"
              className={`${fieldClass} h-[38px] p-1`}
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </Labeled>
        </div>
        <Labeled label="Icon (lucide name, optional)">
          <input className={fieldClass} value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="server" />
        </Labeled>
        <Labeled label="Description">
          <textarea
            className={fieldClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </Labeled>

        <div className="flex items-center justify-between">
          <span className="text-xs text-fg-muted">Custom fields</span>
          <button type="button" className={btnGhost} onClick={addField}>
            + Add field
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {fields.map((f, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_120px_auto_auto] items-center gap-2">
              <input
                className={fieldClass}
                placeholder="key"
                value={f.key}
                onChange={(e) => updateField(i, { key: e.target.value })}
              />
              <input
                className={fieldClass}
                placeholder="label"
                value={f.label}
                onChange={(e) => updateField(i, { label: e.target.value })}
              />
              <select
                className={fieldClass}
                value={f.type}
                onChange={(e) => updateField(i, { type: e.target.value as FieldType })}
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t} className="bg-panel">
                    {t}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-xs text-fg-muted">
                <input
                  type="checkbox"
                  checked={f.required ?? false}
                  onChange={(e) => updateField(i, { required: e.target.checked })}
                />
                req
              </label>
              <button type="button" className={`${btnGhost} text-error`} onClick={() => removeField(i)}>
                ✕
              </button>
              {f.type === "select" && (
                <input
                  className={`${fieldClass} col-span-5`}
                  placeholder="options, comma-separated"
                  value={Array.isArray(f.options) ? f.options.join(", ") : (f.options ?? "")}
                  onChange={(e) =>
                    updateField(i, {
                      options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    })
                  }
                />
              )}
            </div>
          ))}
        </div>

        <div className="mt-2 flex justify-between">
          <div>
            {onDelete && (
              <button type="button" className={`${btnGhost} text-error`} disabled={pending} onClick={onDelete}>
                Delete type
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className={btnGhost} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={btnPrimary} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Asset editor                                                               */
/* -------------------------------------------------------------------------- */

export interface AssetEditorSubmit {
  assetTypeId: string;
  name: string;
  description?: string;
  values: Record<string, unknown>;
}

interface AssetEditorProps {
  type: AssetType;
  value: Asset | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: AssetEditorSubmit) => void;
}

export function AssetEditor({ type, value, pending, onClose, onSubmit }: AssetEditorProps) {
  const schema = (type.fieldSchema as FieldDef[]) ?? [];
  const [name, setName] = useState(value?.name ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [values, setValues] = useState<Record<string, unknown>>(
    (value?.values as Record<string, unknown>) ?? {},
  );

  function setVal(key: string, v: unknown) {
    setValues((s) => ({ ...s, [key]: v }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ assetTypeId: type.id, name, description: description || undefined, values });
  }

  return (
    <Modal onClose={onClose} title={value ? `Edit ${type.name}` : `New ${type.name}`}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Labeled label="Name">
          <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} required />
        </Labeled>
        <Labeled label="Description">
          <textarea
            className={fieldClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </Labeled>
        {schema.map((f) => (
          <Labeled key={f.key} label={`${f.label}${f.required ? " *" : ""}`}>
            {f.type === "select" ? (
              <select
                className={fieldClass}
                value={(values[f.key] as string) ?? ""}
                onChange={(e) => setVal(f.key, e.target.value)}
              >
                <option value="" className="bg-panel">
                  —
                </option>
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o} className="bg-panel">
                    {o}
                  </option>
                ))}
              </select>
            ) : f.type === "number" ? (
              <input
                type="number"
                className={fieldClass}
                value={(values[f.key] as number | string) ?? ""}
                onChange={(e) => setVal(f.key, e.target.value)}
              />
            ) : f.type === "tags" ? (
              <input
                className={fieldClass}
                placeholder="comma-separated"
                value={Array.isArray(values[f.key]) ? (values[f.key] as string[]).join(", ") : ""}
                onChange={(e) =>
                  setVal(f.key, e.target.value.split(",").map((s) => s.trim()).filter(Boolean))
                }
              />
            ) : (
              <input
                className={fieldClass}
                value={(values[f.key] as string) ?? ""}
                onChange={(e) => setVal(f.key, e.target.value)}
                placeholder={f.type === "url" ? "https://…" : undefined}
              />
            )}
          </Labeled>
        ))}
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={btnPrimary} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Primitives                                                                 */
/* -------------------------------------------------------------------------- */

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-[10px] border border-hairline bg-panel p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-base font-medium">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-fg-muted">{label}</span>
      {children}
    </label>
  );
}
