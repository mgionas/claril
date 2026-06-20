"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Trash2 } from "lucide-react";
import type { AiProvider } from "@claril/ai-advisor";
import { PROVIDER_META, providerMeta } from "@/lib/ai-providers";
import { testProviderConnection } from "@/lib/ai-models";
import { removeAiConfig, saveAiConfig, type AiConfigView } from "@/lib/actions";
import { ModelPicker } from "@/components/ai/model-picker";
import { ProviderIcon } from "@/components/ai/provider-icon";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  initial: AiConfigView | null;
}

export function AiSettingsForm({ initial }: Props) {
  const router = useRouter();
  const canEdit = initial?.canEdit ?? true; // no config yet → owner-led first run
  const isConnected = Boolean(initial);

  const [provider, setProvider] = useState<AiProvider>(initial?.provider ?? "anthropic");
  const [model, setModel] = useState(initial?.model ?? "");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [refetchKey, setRefetchKey] = useState(0);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const meta = providerMeta(provider);

  async function onTest() {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(
        await testProviderConnection(provider, model, apiKey || undefined, baseUrl || undefined),
      );
    } finally {
      setTesting(false);
    }
  }

  async function onSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await saveAiConfig({
        provider,
        model: model || undefined,
        baseUrl: baseUrl || undefined,
        apiKey: apiKey || undefined,
      });
      setSaved(true);
      setApiKey("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save AI settings.");
    } finally {
      setSaving(false);
    }
  }

  async function onRemove() {
    setRemoving(true);
    setError(null);
    try {
      await removeAiConfig();
      setConfirmRemove(false);
      setApiKey("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove the AI provider.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="animate-[fadeIn_160ms_ease]">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-xs text-fg-subtle transition-colors hover:text-fg-muted"
      >
        <ArrowLeft className="size-3.5" /> Back
      </Link>

      <h1 className="text-lg font-medium">AI provider</h1>
      <p className="mt-1 text-sm text-fg-muted">
        Provider-agnostic, bring-your-own-key. The key is stored encrypted per organization and
        never sent to the browser. Claril works fully without AI — this only powers the advisor and
        other AI features.
      </p>

      {!canEdit && (
        <p className="mt-4 rounded-[6px] border border-hairline bg-elevated px-3 py-2 text-sm text-warning">
          Only organization owners or admins can change AI settings. Showing the current
          configuration (read-only).
        </p>
      )}

      <div className="mt-6 flex flex-col gap-4 rounded-[10px] border border-hairline bg-panel p-5">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-fg-muted" htmlFor="provider-select">
            Provider
          </Label>
          <Select
            value={provider}
            disabled={!canEdit}
            onValueChange={(v) => {
              setProvider(v as AiProvider);
              setModel("");
              setTestResult(null);
            }}
          >
            <SelectTrigger id="provider-select" className="w-full bg-elevated">
              <SelectValue>
                <span className="flex items-center gap-2">
                  <ProviderIcon provider={provider} className="size-4 text-fg-muted" />
                  {meta.label}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="border-hairline bg-panel">
              {PROVIDER_META.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  <ProviderIcon provider={p.value} className="size-4 text-fg-muted" />
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {meta.needsKey && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-fg-muted" htmlFor="api-key">
              API key
            </Label>
            <Input
              id="api-key"
              type="password"
              className="bg-elevated"
              value={apiKey}
              disabled={!canEdit}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                initial?.hasKey ? "•••••••• (leave blank to keep current)" : "Paste your API key"
              }
              autoComplete="off"
            />
            <p className="mt-1 text-[11px] text-fg-subtle">
              {meta.keyHint}{" "}
              <a
                href={meta.keyUrl}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                {meta.keyUrlLabel} →
              </a>
            </p>
          </div>
        )}

        {(provider === "ollama" || provider === "openai") && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-fg-muted" htmlFor="base-url">
              Base URL {provider === "openai" ? "(optional, OpenAI-compatible proxies)" : ""}
            </Label>
            <Input
              id="base-url"
              className="bg-elevated"
              value={baseUrl}
              disabled={!canEdit}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={
                provider === "ollama" ? "http://localhost:11434/v1" : "https://api.openai.com/v1"
              }
            />
          </div>
        )}

        <ModelPicker
          provider={provider}
          apiKey={apiKey}
          baseUrl={baseUrl}
          value={model}
          onChange={setModel}
          disabled={!canEdit}
          refetchKey={refetchKey}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRefetchKey((k) => k + 1)}
            disabled={!canEdit}
            className="text-fg-muted"
          >
            Refresh models
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onTest}
            disabled={!canEdit || testing || !model}
            className="gap-1.5 text-fg-muted"
          >
            {testing && <Loader2 className="size-3 animate-spin" />}
            {testing ? "Testing…" : "Test connection"}
          </Button>
          {testResult && (
            <span className={cn("text-[11px]", testResult.ok ? "text-success" : "text-error")}>
              {testResult.message}
            </span>
          )}
        </div>

        {error && <p className="text-sm text-error">{error}</p>}

        <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
          <Button type="button" onClick={onSave} disabled={!canEdit || saving || !model}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-xs text-success">
              <Check className="size-3.5" /> Saved
            </span>
          )}

          {isConnected && canEdit && (
            <div className="ml-auto flex items-center gap-2">
              {confirmRemove ? (
                <>
                  <span className="text-[11px] text-fg-muted">Remove the saved key & model?</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmRemove(false)}
                    disabled={removing}
                    className="text-fg-muted"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={onRemove}
                    disabled={removing}
                    className="gap-1.5"
                  >
                    {removing && <Loader2 className="size-3 animate-spin" />}
                    {removing ? "Removing…" : "Confirm remove"}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmRemove(true)}
                  className="gap-1.5 text-error hover:bg-error/10 hover:text-error"
                >
                  <Trash2 className="size-3.5" />
                  Disconnect provider
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
