"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Link2,
  Loader2,
  Network,
  Pencil,
  Trash2,
} from "lucide-react";
import type { Asset, AssetType, AssetLink, FieldDef } from "@claril/db";
import type { AssetUsage } from "@/lib/catalog-actions";
import { deleteAsset, updateAsset } from "@/lib/catalog-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TypeChip } from "@/components/catalog/type-chip";
import { FieldValueView } from "@/components/catalog/field-value";
import { AssetEditor } from "@/components/catalog-admin";

interface LinkRow {
  link: AssetLink;
  /** The other endpoint asset, if resolvable in-org. */
  other: Asset | null;
  direction: "out" | "in";
}

interface Props {
  asset: Asset;
  assetType: AssetType | null;
  usage: AssetUsage[];
  links: LinkRow[];
  /** id -> Asset for resolving reference fields to names/links. */
  referenced: Asset[];
  /** Whether the current member can edit/delete (owner/admin). */
  canManage: boolean;
}

export function AssetDetail({
  asset,
  assetType,
  usage,
  links,
  referenced,
  canManage,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const schema = (assetType?.fieldSchema as FieldDef[] | undefined) ?? [];
  const values = (asset.values as Record<string, unknown>) ?? {};

  const resolve = useMemo(
    () => new Map(referenced.map((a) => [a.id, a])),
    [referenced],
  );

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteAsset(asset.id);
        router.push("/catalog");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Delete failed.");
        setConfirmDelete(false);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/catalog"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="size-4" />
        Asset Catalog
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">{asset.name}</h1>
            <TypeChip type={assetType} />
          </div>
          {asset.description && (
            <p className="mt-1.5 max-w-2xl text-sm text-fg-muted">{asset.description}</p>
          )}
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-error hover:text-error"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          </div>
        )}
      </header>

      {error && (
        <p className="rounded-[6px] border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
          {error}
        </p>
      )}

      {/* Fields */}
      <Section title="Fields">
        {schema.length === 0 ? (
          <p className="px-3 py-3 text-sm text-fg-subtle">
            This type has no custom fields.
          </p>
        ) : (
          <dl className="divide-y divide-hairline">
            {schema.map((f) => (
              <div
                key={f.key}
                className="grid grid-cols-1 gap-1 px-3 py-2.5 sm:grid-cols-[180px_1fr] sm:gap-4"
              >
                <dt className="text-sm text-fg-muted">
                  {f.label}
                  {f.required && <span className="text-error"> *</span>}
                </dt>
                <dd className="text-sm">
                  <FieldValueView field={f} value={values[f.key]} resolve={resolve} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Section>

      {/* Asset links (CMDB graph) */}
      {links.length > 0 && (
        <Section title="Linked assets" icon={<Network className="size-4" />}>
          <ul className="divide-y divide-hairline">
            {links.map(({ link, other, direction }) => (
              <li key={link.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
                <Link2 className="size-3.5 shrink-0 text-fg-subtle" />
                <span className="rounded-full bg-elevated px-1.5 py-0.5 text-[11px] text-fg-subtle">
                  {direction === "out" ? link.relationType : `${link.relationType} (incoming)`}
                </span>
                {other ? (
                  <Link
                    href={`/catalog/${other.id}`}
                    className="truncate text-accent underline-offset-2 hover:underline"
                  >
                    {other.name}
                  </Link>
                ) : (
                  <span className="truncate font-mono text-xs text-fg-subtle">
                    {direction === "out" ? link.toAssetId : link.fromAssetId}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Used in (impact analysis) */}
      <Section
        title="Used in"
        icon={<FileText className="size-4" />}
        count={usage.length}
      >
        {usage.length === 0 ? (
          <p className="px-3 py-3 text-sm text-fg-subtle">
            Not referenced by any diagram element yet. Bind it from a diagram to ground the AI
            and enable impact analysis.
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {usage.map((u) => (
              <li
                key={`${u.diagramId}:${u.elementId}`}
                className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm"
              >
                <Link
                  href={`/d/${u.diagramId}`}
                  className="truncate text-fg transition-colors hover:text-accent"
                >
                  {u.diagramName}
                </Link>
                <span className="shrink-0 font-mono text-[11px] text-fg-subtle">
                  {u.elementId}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {editing && assetType && (
        <AssetEditor
          type={assetType}
          value={asset}
          pending={pending}
          onClose={() => setEditing(false)}
          onSubmit={(input) => {
            setError(null);
            startTransition(async () => {
              try {
                await updateAsset(asset.id, input);
                setEditing(false);
                router.refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Save failed.");
              }
            });
          }}
        />
      )}

      <Dialog
        open={confirmDelete}
        onOpenChange={(o) => !pending && setConfirmDelete(o)}
      >
        <DialogContent className="border-hairline bg-panel/95 text-fg backdrop-blur sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete “{asset.name}”?</DialogTitle>
            <DialogDescription className="text-fg-muted">
              This permanently deletes the asset
              {usage.length > 0
                ? ` and removes it from ${usage.length} diagram element(s)`
                : ""}
              . This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={handleDelete}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Delete asset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-0 border-hairline bg-panel/40 py-0">
      <CardHeader className="border-b border-hairline px-3 py-3">
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-fg-muted">
          {icon}
          {title}
          {typeof count === "number" && (
            <Badge variant="secondary" className="tabular-nums">
              {count}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 py-0">{children}</CardContent>
    </Card>
  );
}
