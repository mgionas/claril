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
  /** Auto-expand this provider's card when it isn't connected yet (optional). */
  initialProvider?: AiProvider;
}

/** Encode a {provider, model} pair into a single Select value. */
const encodeDefault = (provider: AiProvider, model: string) => `${provider}::${model}`;
const decodeDefault = (v: string): { provider: AiProvider; model: string } => {
  const idx = v.indexOf("::");
  return { provider: v.slice(0, idx) as AiProvider, model: v.slice(idx + 2) };
};

type TestResult = { ok: boolean; message: string } | null;

function StatusPill({ connection }: { connection?: ConnectionView }) {
  if (connection?.usable) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
        <span className="size-1.5 rounded-full bg-success" />
        Connected
      </span>
    );
  }
  if (connection && !connection.usable) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
        Needs key
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-2 py-0.5 text-[10px] font-medium text-fg-subtle">
      Not connected
    </span>
  );
}

function ProviderCard({
  provider,
  connection,
  canEdit,
  defaultOpen,
  onChanged,
}: {
  provider: AiProvider;
  connection?: ConnectionView;
  canEdit: boolean;
  defaultOpen: boolean;
  onChanged: () => Promise<void>;
}) {
  const meta = providerMeta(provider);
  const connected = Boolean(connection?.usable);

  const [expanded, setExpanded] = useState(defaultOpen);
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
    setExpanded(true);
  }

  function closeForm() {
    setExpanded(false);
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
      await connectAiProvider({
        provider,
        apiKey: apiKey || undefined,
        baseUrl: baseUrl || undefined,
        defaultModel: model || undefined,
      });
      setExpanded(false);
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
      await removeAiProvider(provider);
      setConfirmRemove(false);
      setExpanded(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove provider.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[10px] border border-hairline bg-elevated/30 p-3">
      <div className="flex items-center gap-2.5">
        <ProviderIcon provider={provider} className="size-5 shrink-0 text-fg-muted" />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-fg">{meta.label}</span>
          {connected && connection?.defaultModel && (
            <span className="truncate font-mono text-[10px] text-fg-subtle">
              {connection.defaultModel}
            </span>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {connection?.isOrgDefault && (
            <span className="inline-flex items-center rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
              Default
            </span>
          )}
          <StatusPill connection={connection} />
        </div>
      </div>

      {/* Action row */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
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
              onClick={() => (expanded ? closeForm() : openForm())}
              disabled={!canEdit}
              className="text-fg-muted"
            >
              {expanded ? "Cancel" : "Edit"}
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
        ) : (
          <Button
            type="button"
            variant={expanded ? "ghost" : "outline"}
            size="sm"
            onClick={() => (expanded ? closeForm() : openForm())}
            disabled={!canEdit}
            className={expanded ? "text-fg-muted" : ""}
          >
            {expanded ? "Cancel" : "Add"}
          </Button>
        )}

        {testResult && !expanded && (
          <span className={cn("text-[11px]", testResult.ok ? "text-success" : "text-error")}>
            {testResult.message}
          </span>
        )}
      </div>

      {expanded && (
        <div className="mt-3 flex animate-[fadeIn_160ms_ease] flex-col gap-3 border-t border-hairline pt-3">
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

      {error && !expanded && <p className="mt-2 text-[11px] text-error">{error}</p>}
    </div>
  );
}

/**
 * Multi-provider connections manager: org-default model selector + a card per
 * provider (Test / Edit / Remove / Connect). Owns its own data load and refresh.
 * Rendered both inside the workbench settings dialog and on /settings/ai.
 */
export function AiConnectionsManager({ initialProvider }: AiConnectionsManagerProps) {
  const router = useRouter();
  const [data, setData] = useState<AiSettingsView | null>(null);
  const [loading, setLoading] = useState(false);
  const [defaultError, setDefaultError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await getAiSettings();
    setData(next);
    router.refresh();
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAiSettings()
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const canEdit = data?.canEdit ?? false;
  const connections = data?.connections ?? [];
  const byProvider = new Map(connections.map((c) => [c.provider, c]));
  const usable = connections.filter((c) => c.usable);
  const orgDefault = data?.orgDefault;
  const defaultValue = orgDefault ? encodeDefault(orgDefault.provider, orgDefault.model) : "";

  async function onDefaultChange(v: string) {
    const { provider, model } = decodeDefault(v);
    setDefaultError(null);
    try {
      await setOrgDefaultModel({ provider, model });
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

  return (
    <div className="flex flex-col">
      {/* Org default selector */}
      {usable.length > 0 && (
        <div className="mt-4 flex flex-col gap-1.5">
          <Label className="text-xs text-fg-muted" htmlFor="org-default-select">
            Organization default
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

      {/* Cards grid */}
      <div className="mt-4 flex flex-col gap-2.5 overflow-y-auto pr-1">
        {PROVIDER_META.map((p) => {
          const connection = byProvider.get(p.value);
          return (
            <ProviderCard
              key={p.value}
              provider={p.value}
              connection={connection}
              canEdit={canEdit}
              defaultOpen={!connection?.usable && p.value === initialProvider}
              onChanged={refresh}
            />
          );
        })}
      </div>
    </div>
  );
}
