"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import type { AiProvider } from "@claril/ai-advisor";
import { PROVIDER_META, providerMeta } from "@/lib/ai-providers";
import { testProviderConnection } from "@/lib/ai-models";
import { saveAiConfig, type AiConfigView } from "@/lib/actions";
import { ModelPicker } from "@/components/ai/model-picker";
import { cn } from "@/lib/utils";

const fieldClass =
  "rounded-[6px] border border-hairline bg-elevated px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-accent disabled:opacity-50";

interface Props {
  initial: AiConfigView | null;
}

export function AiSettingsForm({ initial }: Props) {
  const router = useRouter();
  const canEdit = initial?.canEdit ?? true; // no config yet → owner-led first run

  const [provider, setProvider] = useState<AiProvider>(initial?.provider ?? "anthropic");
  const [model, setModel] = useState(initial?.model ?? "");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [refetchKey, setRefetchKey] = useState(0);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
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
        <label className="flex flex-col gap-1">
          <span className="text-xs text-fg-muted">Provider</span>
          <select
            className={fieldClass}
            value={provider}
            disabled={!canEdit}
            onChange={(e) => {
              setProvider(e.target.value as AiProvider);
              setModel("");
              setTestResult(null);
            }}
          >
            {PROVIDER_META.map((p) => (
              <option key={p.value} value={p.value} className="bg-panel">
                {p.label}
              </option>
            ))}
          </select>
        </label>

        {meta.needsKey && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-fg-muted">API key</span>
            <input
              type="password"
              className={fieldClass}
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
          </label>
        )}

        {(provider === "ollama" || provider === "openai") && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-fg-muted">
              Base URL {provider === "openai" ? "(optional, OpenAI-compatible proxies)" : ""}
            </span>
            <input
              className={fieldClass}
              value={baseUrl}
              disabled={!canEdit}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={
                provider === "ollama"
                  ? "http://localhost:11434/v1"
                  : "https://api.openai.com/v1"
              }
            />
          </label>
        )}

        <ModelPicker
          provider={provider}
          apiKey={apiKey}
          baseUrl={baseUrl}
          value={model}
          onChange={setModel}
          refetchKey={refetchKey}
        />

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setRefetchKey((k) => k + 1)}
            disabled={!canEdit}
            className="rounded-[6px] border border-hairline px-3 py-1.5 text-xs text-fg-muted transition-colors hover:border-fg-subtle disabled:opacity-50"
          >
            Refresh models
          </button>
          <button
            type="button"
            onClick={onTest}
            disabled={!canEdit || testing || !model}
            className="flex items-center gap-1.5 rounded-[6px] border border-hairline px-3 py-1.5 text-xs text-fg-muted transition-colors hover:border-fg-subtle disabled:opacity-50"
          >
            {testing && <Loader2 className="size-3 animate-spin" />}
            {testing ? "Testing…" : "Test connection"}
          </button>
          {testResult && (
            <span className={cn("text-[11px]", testResult.ok ? "text-success" : "text-error")}>
              {testResult.message}
            </span>
          )}
        </div>

        {error && <p className="text-sm text-error">{error}</p>}

        <div className="flex items-center gap-3 border-t border-hairline pt-4">
          <button
            type="button"
            onClick={onSave}
            disabled={!canEdit || saving || !model}
            className="rounded-[6px] bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-xs text-success">
              <Check className="size-3.5" /> Saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
