"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import type { AiProvider } from "@claril/ai-advisor";
import { PROVIDER_META, providerMeta } from "@/lib/ai-providers";
import { testProviderConnection } from "@/lib/ai-models";
import { saveAiConfig } from "@/lib/actions";
import { ModelPicker } from "@/components/ai/model-picker";
import { cn } from "@/lib/utils";

const fieldClass =
  "rounded-[6px] border border-hairline bg-elevated px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-accent";

type Step = 0 | 1 | 2;
const STEP_LABELS = ["Provider", "API key", "Model"] as const;

interface AiSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  initialProvider?: string;
}

export function AiSettingsDialog({ open, onClose, initialProvider }: AiSettingsDialogProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [provider, setProvider] = useState<AiProvider>(
    (initialProvider as AiProvider) ?? "anthropic",
  );
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [refetchKey, setRefetchKey] = useState(0);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset to step 0 each time the dialog opens.
  useEffect(() => {
    if (open) {
      setStep(0);
      setProvider((initialProvider as AiProvider) ?? "anthropic");
      setError(null);
      setTestResult(null);
    }
  }, [open, initialProvider]);

  if (!open) return null;
  const meta = providerMeta(provider);

  function goModelStep() {
    // Re-fetch live models now that the key is entered.
    setRefetchKey((k) => k + 1);
    setStep(2);
  }

  async function onTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testProviderConnection(
        provider,
        model,
        apiKey || undefined,
        baseUrl || undefined,
      );
      setTestResult(res);
    } finally {
      setTesting(false);
    }
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      await saveAiConfig({
        provider,
        model: model || undefined,
        baseUrl: baseUrl || undefined,
        apiKey: apiKey || undefined,
      });
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save AI settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[10px] border border-hairline bg-panel p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="AI provider setup"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-medium">Set up AI provider</h2>
            <p className="mt-1 text-sm text-fg-muted">
              Bring your own key — stored encrypted, per organization. Claril works fully without
              AI; this only enables the advisor and other AI features.
            </p>
          </div>
        </div>

        {/* Step indicator */}
        <ol className="mt-4 flex items-center gap-2" aria-label="Setup steps">
          {STEP_LABELS.map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[11px] transition-colors",
                  i < step
                    ? "bg-accent text-white"
                    : i === step
                      ? "border border-accent text-accent"
                      : "border border-hairline text-fg-subtle",
                )}
              >
                {i < step ? <Check className="size-3" /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-xs transition-colors",
                  i === step ? "text-fg" : "text-fg-subtle",
                )}
              >
                {label}
              </span>
              {i < STEP_LABELS.length - 1 && <ChevronRight className="size-3 text-fg-subtle" />}
            </li>
          ))}
        </ol>

        <div key={step} className="mt-5 flex animate-[fadeIn_160ms_ease] flex-col gap-3">
          {step === 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-fg-muted">Provider</span>
              <select
                className={fieldClass}
                value={provider}
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
              <p className="mt-1 text-[11px] text-fg-subtle">
                Provider-agnostic. Switch any time — keys are stored per provider, encrypted.
              </p>
            </label>
          )}

          {step === 1 && (
            <>
              {meta.needsKey ? (
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-fg-muted">API key</span>
                  <input
                    type="password"
                    className={fieldClass}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Leave blank to keep the existing key"
                    autoComplete="off"
                    autoFocus
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
              ) : (
                <p className="text-sm text-fg-muted">{meta.keyHint}</p>
              )}

              {(provider === "ollama" || provider === "openai") && (
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-fg-muted">
                    Base URL {provider === "openai" ? "(optional, for compatible proxies)" : ""}
                  </span>
                  <input
                    className={fieldClass}
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder={
                      provider === "ollama"
                        ? "http://localhost:11434/v1"
                        : "https://api.openai.com/v1"
                    }
                  />
                </label>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <ModelPicker
                provider={provider}
                apiKey={apiKey}
                baseUrl={baseUrl}
                value={model}
                onChange={setModel}
                refetchKey={refetchKey}
              />

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onTest}
                  disabled={testing || !model}
                  className="flex items-center gap-1.5 rounded-[6px] border border-hairline px-3 py-1.5 text-xs text-fg-muted transition-colors hover:border-fg-subtle disabled:opacity-50"
                >
                  {testing && <Loader2 className="size-3 animate-spin" />}
                  {testing ? "Testing…" : "Test connection"}
                </button>
                {testResult && (
                  <span
                    className={cn(
                      "text-[11px]",
                      testResult.ok ? "text-success" : "text-error",
                    )}
                  >
                    {testResult.message}
                  </span>
                )}
              </div>
            </>
          )}

          {error && <p className="text-sm text-error">{error}</p>}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <Link
            href="/settings/ai"
            onClick={onClose}
            className="text-xs text-fg-subtle transition-colors hover:text-fg-muted"
          >
            Manage in settings →
          </Link>

          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as Step)}
                className="rounded-[6px] px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-elevated"
              >
                Back
              </button>
            )}
            {step < 2 ? (
              <button
                type="button"
                onClick={() => (step === 1 ? goModelStep() : setStep((s) => (s + 1) as Step))}
                className="rounded-[6px] bg-accent px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={onSave}
                disabled={saving || !model}
                className="rounded-[6px] bg-accent px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
