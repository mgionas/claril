"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Asset, AssetType, FieldDef, FieldType } from "@claril/db";
import {
  createAssetType,
  updateAssetType,
  deleteAssetType,
  ensureBuiltinAssetTypes,
  createAsset,
  updateAsset,
  deleteAsset,
} from "@/lib/catalog-actions";

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
  "rounded-[6px] border border-hairline bg-elevated px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-accent";
const btnPrimary =
  "rounded-[6px] bg-accent px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50";
const btnGhost =
  "rounded-[6px] px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-elevated";

interface Props {
  initialTypes: AssetType[];
  initialAssets: Asset[];
}

export function CatalogAdmin({ initialTypes, initialAssets }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(
    initialTypes[0]?.id ?? null,
  );
  const [typeEditor, setTypeEditor] = useState<AssetType | "new" | null>(null);
  const [assetEditor, setAssetEditor] = useState<Asset | "new" | null>(null);

  const selectedType = useMemo(
    () => initialTypes.find((t) => t.id === selectedTypeId) ?? null,
    [initialTypes, selectedTypeId],
  );
  const visibleAssets = useMemo(
    () => initialAssets.filter((a) => a.assetTypeId === selectedTypeId),
    [initialAssets, selectedTypeId],
  );

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

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium">Asset Catalog</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Org-level CMDB. Reusable typed objects that diagram elements reference.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className={btnGhost}
            disabled={pending}
            onClick={() => run(() => ensureBuiltinAssetTypes())}
          >
            Seed built-in types
          </button>
          <a className={btnGhost} href="/">
            Back to workbench
          </a>
        </div>
      </header>

      {error && (
        <p className="rounded-[6px] border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
          {error}
        </p>
      )}

      <div className="grid grid-cols-[280px_1fr] gap-6">
        {/* Asset types */}
        <aside className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-fg-muted">Object types</h2>
            <button className={btnGhost} onClick={() => setTypeEditor("new")}>
              + New
            </button>
          </div>
          <ul className="flex flex-col gap-1">
            {initialTypes.length === 0 && (
              <li className="text-sm text-fg-subtle">
                No types yet. Seed the built-ins or create one.
              </li>
            )}
            {initialTypes.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => setSelectedTypeId(t.id)}
                  className={`flex w-full items-center justify-between rounded-[6px] border px-3 py-2 text-left text-sm transition-colors ${
                    t.id === selectedTypeId
                      ? "border-accent/40 bg-elevated text-fg"
                      : "border-hairline text-fg-muted hover:bg-elevated"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: t.color ?? "#71717a" }}
                    />
                    {t.name}
                  </span>
                  {t.builtin === "true" && (
                    <span className="text-[10px] uppercase text-fg-subtle">built-in</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Assets of the selected type */}
        <section className="flex flex-col gap-3">
          {selectedType ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-medium">{selectedType.name}</h2>
                  {selectedType.description && (
                    <p className="text-sm text-fg-muted">{selectedType.description}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button className={btnGhost} onClick={() => setTypeEditor(selectedType)}>
                    Edit type
                  </button>
                  <button className={btnPrimary} onClick={() => setAssetEditor("new")}>
                    + New asset
                  </button>
                </div>
              </div>

              <div className="overflow-hidden rounded-[8px] border border-hairline">
                <table className="w-full text-sm">
                  <thead className="bg-panel text-left text-xs text-fg-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Fields</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAssets.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center text-fg-subtle">
                          No assets of this type yet.
                        </td>
                      </tr>
                    )}
                    {visibleAssets.map((a) => (
                      <tr key={a.id} className="border-t border-hairline">
                        <td className="px-3 py-2">
                          <div className="text-fg">{a.name}</div>
                          {a.description && (
                            <div className="text-xs text-fg-subtle">{a.description}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-fg-muted">
                          {summarizeValues(selectedType.fieldSchema as FieldDef[], a.values)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button className={btnGhost} onClick={() => setAssetEditor(a)}>
                            Edit
                          </button>
                          <button
                            className={`${btnGhost} text-error`}
                            disabled={pending}
                            onClick={() => run(() => deleteAsset(a.id))}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-sm text-fg-subtle">Select or create an object type.</p>
          )}
        </section>
      </div>

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
                    setSelectedTypeId(null);
                    setTypeEditor(null);
                  })
          }
        />
      )}

      {assetEditor && selectedType && (
        <AssetEditor
          type={selectedType}
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

function summarizeValues(schema: FieldDef[], values: unknown): string {
  const v = (values ?? {}) as Record<string, unknown>;
  const parts = schema
    .map((f) => {
      const raw = v[f.key];
      if (raw == null || raw === "") return null;
      const text = Array.isArray(raw) ? raw.join(", ") : String(raw);
      return `${f.label}: ${text}`;
    })
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
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

interface AssetEditorProps {
  type: AssetType;
  value: Asset | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: {
    assetTypeId: string;
    name: string;
    description?: string;
    values: Record<string, unknown>;
  }) => void;
}

function AssetEditor({ type, value, pending, onClose, onSubmit }: AssetEditorProps) {
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
