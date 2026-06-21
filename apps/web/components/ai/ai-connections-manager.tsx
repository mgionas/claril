"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { AiProvider } from "@claril/ai-advisor";
import { PROVIDER_META, providerMeta } from "@/lib/ai-providers";
import { testProviderConnection } from "@/lib/ai-models";
import {
  connectAiProvider,
  getAiSettings,
  removeAiProvider,
  setOrgDefaultModel,
  connectUserAiProvider,
  getUserAiSettings,
  removeUserAiProvider,
  setUserDefaultModel,
  type AiSettingsView,
} from "@/lib/actions";
import type { ConnectionView } from "@/lib/ai";
import { ProviderConnectForm } from "@/components/provider-connect-form";
import { ProviderIcon } from "@/components/ai/provider-icon";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface AiConnectionsManagerProps {
  /** Auto-select & expand this provider when it isn't connected yet (optional). */
  initialProvider?: AiProvider;
  /** Which credential store the manager reads/writes. Defaults to "org". */
  scope?: "personal" | "org";
}

/** Encode a {provider, model} pair into a single Select value. */
const encodeDefault = (provider: AiProvider, model: string) => `${provider}::${model}`;
const decodeDefault = (v: string): { provider: AiProvider; model: string } => {
  const idx = v.indexOf("::");
  return { provider: v.slice(0, idx) as AiProvider, model: v.slice(idx + 2) };
};

type TestResult = { ok: boolean; message: string } | null;

/** Connection status, distilled to one of three states shared with the tile dot. */
type ProviderStatus = "connected" | "needs-key" | "not-connected";
function statusOf(connection?: ConnectionView): ProviderStatus {
  if (connection?.usable) return "connected";
  if (connection && !connection.usable) return "needs-key";
  return "not-connected";
}

const STATUS_META: Record<ProviderStatus, { label: string; dot: string; text: string }> = {
  connected: { label: "Connected", dot: "bg-success", text: "text-success" },
  "needs-key": { label: "Needs key", dot: "bg-warning", text: "text-warning" },
  "not-connected": { label: "Not connected", dot: "bg-fg-subtle/50", text: "text-fg-subtle" },
};

/**
 * Compact, scannable provider tile: icon + label + status dot, with a subtle
 * "Default" marker and the current model in tiny muted text. A real toggle
 * button (single-open accordion) that drives the shared detail panel below.
 */
function ProviderTile({
  provider,
  connection,
  selected,
  onSelect,
}: {
  provider: AiProvider;
  connection?: ConnectionView;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = providerMeta(provider);
  const status = statusOf(connection);
  const s = STATUS_META[status];

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-expanded={selected}
      aria-pressed={selected}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-[10px] border p-2.5 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
        selected
          ? "border-accent/60 bg-accent/[0.07]"
          : "border-hairline bg-elevated/30 hover:border-fg-subtle/25 hover:bg-elevated/60",
      )}
    >
      <ProviderIcon provider={provider} className="size-5 shrink-0 text-fg-muted" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-fg">{meta.label}</span>
          {connection?.isOrgDefault && (
            <span className="shrink-0 rounded-full border border-accent/40 bg-accent/10 px-1.5 py-px text-[9px] font-medium leading-tight text-accent">
              Default
            </span>
          )}
        </span>
        {connection?.usable && connection.defaultModel ? (
          <span className="truncate font-mono text-[10px] text-fg-subtle">
            {connection.defaultModel}
          </span>
        ) : (
          <span className={cn("truncate text-[10px]", s.text)}>{s.label}</span>
        )}
      </div>
      <span
        className={cn("size-2 shrink-0 rounded-full", s.dot)}
        role="img"
        aria-label={`Status: ${s.label}`}
      />
    </button>
  );
}

/**
 * Focused detail panel for a single selected provider — exactly the actions the
 * old card had: Test / Edit (form) / Remove for connected, or the connect form
 * + Connect when not. Remounted per provider (via key) so form state is fresh.
 */
function ProviderDetail({
  provider,
  connection,
  canEdit,
  startEditing,
  onChanged,
  connect,
  remove,
}: {
  provider: AiProvider;
  connection?: ConnectionView;
  canEdit: boolean;
  /** When false (connected), start collapsed showing Test/Edit/Remove. */
  startEditing: boolean;
  onChanged: () => Promise<void>;
  /** Scoped connect action (org or personal). */
  connect: (input: {
    provider: AiProvider;
    apiKey?: string;
    baseUrl?: string;
    defaultModel?: string;
  }) => Promise<void>;
  /** Scoped remove action (org or personal). */
  remove: (provider: AiProvider) => Promise<void>;
}) {
  const meta = providerMeta(provider);
  const connected = Boolean(connection?.usable);

  const [editing, setEditing] = useState(startEditing);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(connection?.baseUrl ?? "");
  const [model, setModel] = useState(connection?.defaultModel ?? "");
  const [refetchKey, setRefetchKey] = useState(0);

  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  function openForm() {
    // Prefill with the stored config; key stays blank (keep existing).
    setApiKey("");
    setBaseUrl(connection?.baseUrl ?? "");
    setModel(connection?.defaultModel ?? "");
    setError(null);
    setTestResult(null);
    setRefetchKey((k) => k + 1);
    setEditing(true);
  }

  function closeForm() {
    setEditing(false);
    setError(null);
    setApiKey("");
  }

  async function onTest() {
    setTesting(true);
    setTestResult(null);
    try {
      // Blank key → server falls back to the stored credential.
      const res = await testProviderConnection(
        provider,
        model || connection?.defaultModel || "",
        apiKey || undefined,
        baseUrl || undefined,
      );
      setTestResult(res);
    } finally {
      setTesting(false);
    }
  }

  async function onConnect() {
    setBusy(true);
    setError(null);
    try {
      await connect({
        provider,
        apiKey: apiKey || undefined,
        baseUrl: baseUrl || undefined,
        defaultModel: model || undefined,
      });
      setEditing(false);
      setApiKey("");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save provider.");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    setError(null);
    try {
      await remove(provider);
      setConfirmRemove(false);
      setEditing(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove provider.");
    } finally {
      setBusy(false);
    }
  }

  // For connected providers we show the form only when "Edit" is toggled on.
  // For not-connected providers the form is always present (connect flow).
  const showForm = connected ? editing : true;

  return (
    <div className="flex animate-[fadeIn_160ms_ease] flex-col gap-3 rounded-[10px] border border-hairline bg-elevated/30 p-3">
      <div className="flex items-center gap-2.5">
        <ProviderIcon provider={provider} className="size-5 shrink-0 text-fg-muted" />
        <span className="truncate text-sm font-medium text-fg">{meta.label}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {connection?.isOrgDefault && (
            <span className="inline-flex items-center rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
              Default
            </span>
          )}
          <StatusBadge connection={connection} />
        </div>
      </div>

      {/* Action row */}
      <div className="flex flex-wrap items-center gap-2">
        {connected ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onTest}
              disabled={testing || !canEdit}
              className="gap-1.5 text-fg-muted"
            >
              {testing && <Loader2 className="size-3 animate-spin" />}
              {testing ? "Testing…" : "Test"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => (editing ? closeForm() : openForm())}
              disabled={!canEdit}
              className="text-fg-muted"
            >
              {editing ? "Cancel" : "Edit"}
            </Button>
            {confirmRemove ? (
              <span className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onRemove}
                  disabled={busy || !canEdit}
                  className="text-error hover:text-error"
                >
                  {busy ? "Removing…" : "Confirm remove"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmRemove(false)}
                  className="text-fg-subtle"
                >
                  Cancel
                </Button>
              </span>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmRemove(true)}
                disabled={busy || !canEdit}
                className="text-fg-subtle hover:text-error"
              >
                Remove
              </Button>
            )}
          </>
        ) : null}

        {testResult && !showForm && (
          <span className={cn("text-[11px]", testResult.ok ? "text-success" : "text-error")}>
            {testResult.message}
          </span>
        )}
      </div>

      {showForm && (
        <div className="flex flex-col gap-3 border-t border-hairline pt-3">
          <ProviderConnectForm
            provider={provider}
            apiKey={apiKey}
            onApiKeyChange={setApiKey}
            baseUrl={baseUrl}
            onBaseUrlChange={setBaseUrl}
            model={model}
            onModelChange={setModel}
            disabled={!canEdit || busy}
            refetchKey={refetchKey}
          />

          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={onConnect} disabled={busy || !canEdit}>
              {busy ? "Saving…" : connected ? "Save" : "Connect"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onTest}
              disabled={testing || !canEdit}
              className="gap-1.5 text-fg-muted"
            >
              {testing && <Loader2 className="size-3 animate-spin" />}
              {testing ? "Testing…" : "Test"}
            </Button>
            {testResult && (
              <span
                className={cn("text-[11px]", testResult.ok ? "text-success" : "text-error")}
              >
                {testResult.message}
              </span>
            )}
          </div>

          {error && <p className="text-[11px] text-error">{error}</p>}
        </div>
      )}

      {error && !showForm && <p className="text-[11px] text-error">{error}</p>}
    </div>
  );
}

/** Status badge (dot + label) for the detail panel header. */
function StatusBadge({ connection }: { connection?: ConnectionView }) {
  const status = statusOf(connection);
  const s = STATUS_META[status];
  const border =
    status === "connected"
      ? "border-success/40 bg-success/10"
      : status === "needs-key"
        ? "border-warning/40 bg-warning/10"
        : "border-hairline";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        border,
        s.text,
      )}
    >
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

/**
 * Multi-provider connections manager: org-default model selector + a compact
 * grid of provider tiles. Clicking a tile opens a single-open detail panel
 * (Test / Edit / Remove / Connect). Owns its own data load and refresh.
 * Rendered both inside the workbench settings dialog and on /settings/ai.
 */
export function AiConnectionsManager({
  initialProvider,
  scope = "org",
}: AiConnectionsManagerProps) {
  const router = useRouter();
  const isPersonal = scope === "personal";
  // Scope-resolved action set. Each member is a stable module-level function,
  // so we key effects/callbacks off `scope` (a primitive) rather than this
  // object — the object identity changes per render but its contents don't.
  const api = isPersonal
    ? {
        getSettings: getUserAiSettings,
        connect: connectUserAiProvider,
        remove: removeUserAiProvider,
        setDefault: setUserDefaultModel,
      }
    : {
        getSettings: getAiSettings,
        connect: connectAiProvider,
        remove: removeAiProvider,
        setDefault: setOrgDefaultModel,
      };

  const [data, setData] = useState<AiSettingsView | null>(null);
  const [loading, setLoading] = useState(false);
  const [defaultError, setDefaultError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AiProvider | null>(null);
  const [appliedInitial, setAppliedInitial] = useState(false);

  const refresh = useCallback(async () => {
    const getSettings = scope === "personal" ? getUserAiSettings : getAiSettings;
    const next = await getSettings();
    setData(next);
    router.refresh();
  }, [router, scope]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const getSettings = scope === "personal" ? getUserAiSettings : getAiSettings;
    getSettings()
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  const canEdit = data?.canEdit ?? false;
  const connections = data?.connections ?? [];
  const byProvider = new Map(connections.map((c) => [c.provider, c]));
  const usable = connections.filter((c) => c.usable);
  const orgDefault = data?.orgDefault;
  const defaultValue = orgDefault ? encodeDefault(orgDefault.provider, orgDefault.model) : "";

  // Auto-select the requested provider once data has loaded (when not connected).
  useEffect(() => {
    if (appliedInitial || !data || !initialProvider) return;
    const conn = byProvider.get(initialProvider);
    if (!conn?.usable) setSelected(initialProvider);
    setAppliedInitial(true);
  }, [appliedInitial, data, initialProvider, byProvider]);

  async function onDefaultChange(v: string) {
    const { provider, model } = decodeDefault(v);
    setDefaultError(null);
    try {
      await api.setDefault({ provider, model });
      await refresh();
    } catch (e) {
      setDefaultError(e instanceof Error ? e.message : "Couldn't set the default model.");
    }
  }

  if (loading && !data) {
    return (
      <div className="mt-6 flex items-center gap-2 text-sm text-fg-muted">
        <Loader2 className="size-4 animate-spin" />
        Loading providers…
      </div>
    );
  }

  const selectedConnection = selected ? byProvider.get(selected) : undefined;

  return (
    <div className="flex flex-col">
      {/* Org default selector */}
      {usable.length > 0 && (
        <div className="mt-4 flex flex-col gap-1.5">
          <Label className="text-xs text-fg-muted" htmlFor="org-default-select">
            {isPersonal ? "Default model" : "Organization default"}
          </Label>
          <Select value={defaultValue} onValueChange={onDefaultChange} disabled={!canEdit}>
            <SelectTrigger id="org-default-select" className="w-full bg-elevated">
              <SelectValue placeholder="Choose a default model">
                {orgDefault && (
                  <span className="flex items-center gap-2">
                    <ProviderIcon
                      provider={orgDefault.provider}
                      className="size-4 text-fg-muted"
                    />
                    {providerMeta(orgDefault.provider).label} · {orgDefault.model}
                  </span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="border-hairline bg-panel">
              {usable.map((c) => {
                const m = c.defaultModel ?? "";
                return (
                  <SelectItem key={c.provider} value={encodeDefault(c.provider, m)}>
                    <ProviderIcon provider={c.provider} className="size-4 text-fg-muted" />
                    {providerMeta(c.provider).label} · {m}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {defaultError && <p className="text-[11px] text-error">{defaultError}</p>}
        </div>
      )}

      {/* Compact provider tiles */}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {PROVIDER_META.map((p) => {
          const connection = byProvider.get(p.value);
          return (
            <ProviderTile
              key={p.value}
              provider={p.value}
              connection={connection}
              selected={selected === p.value}
              onSelect={() =>
                setSelected((cur) => (cur === p.value ? null : p.value))
              }
            />
          );
        })}
      </div>

      {/* Single-open detail panel for the selected provider */}
      {selected && (
        <div className="mt-3">
          <ProviderDetail
            key={selected}
            provider={selected}
            connection={selectedConnection}
            canEdit={canEdit}
            startEditing={!selectedConnection?.usable}
            onChanged={refresh}
            connect={api.connect}
            remove={api.remove}
          />
        </div>
      )}
    </div>
  );
}
