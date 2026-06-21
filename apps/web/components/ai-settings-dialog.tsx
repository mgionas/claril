"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import type { AiProvider } from "@claril/ai-advisor";
import { PROVIDER_META, providerMeta, keyLooksValid } from "@/lib/ai-providers";
import { testProviderConnection } from "@/lib/ai-models";
import { saveAiConfig } from "@/lib/actions";
import { ModelPicker } from "@/components/ai/model-picker";
import { ProviderIcon } from "@/components/ai/provider-icon";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        aria-label="AI provider setup"
        className="max-w-md gap-0 rounded-[10px] border-hairline bg-panel/95 p-6 backdrop-blur-md"
      >
        <DialogHeader className="text-left">
          <DialogTitle className="text-base font-medium">Set up AI provider</DialogTitle>
          <DialogDescription className="text-sm text-fg-muted">
            Bring your own key — stored encrypted, per organization. Claril works fully without AI;
            this only enables the advisor and other AI features.
          </DialogDescription>
        </DialogHeader>

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
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-fg-muted" htmlFor="provider-select">
                Provider
              </Label>
              <Select
                value={provider}
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
              <p className="mt-1 text-[11px] text-fg-muted">{meta.description}</p>
              <p className="text-[11px] text-fg-subtle">
                Provider-agnostic. Switch any time — keys are stored per provider, encrypted.
              </p>
            </div>
          )}

          {step === 1 && (
            <>
              {meta.needsKey ? (
                <div className="flex flex-col gap-2">
                  {/* How-to guidance */}
                  <div className="rounded-[8px] border border-hairline bg-elevated/40 p-3">
                    <p className="mb-1.5 text-[11px] font-medium text-fg-muted">
                      How to connect {meta.label}
                    </p>
                    <ol className="flex list-decimal flex-col gap-1 pl-4 text-[11px] text-fg-subtle">
                      {meta.steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                    <a
                      href={meta.keyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
                    >
                      Open {meta.keyUrlLabel} ↗
                    </a>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs text-fg-muted" htmlFor="api-key">
                      API key
                    </Label>
                    <Input
                      id="api-key"
                      type="password"
                      className="bg-elevated"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={meta.keyPlaceholder ?? "Leave blank to keep the existing key"}
                      autoComplete="off"
                      autoFocus
                    />
                    {!keyLooksValid(provider, apiKey) && (
                      <p className="text-[11px] text-warning">
                        That doesn&apos;t look like a {meta.label} key — it usually starts with{" "}
                        <code className="font-mono">{meta.keyPrefix}</code>. You can still continue.
                      </p>
                    )}
                    {meta.note && <p className="text-[11px] text-fg-subtle">{meta.note}</p>}
                  </div>
                </div>
              ) : (
                <div className="rounded-[8px] border border-hairline bg-elevated/40 p-3">
                  <p className="mb-1.5 text-[11px] font-medium text-fg-muted">
                    How to run {meta.label}
                  </p>
                  <ol className="flex list-decimal flex-col gap-1 pl-4 text-[11px] text-fg-subtle">
                    {meta.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                  <a
                    href={meta.keyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
                  >
                    Open {meta.keyUrlLabel} ↗
                  </a>
                </div>
              )}

              {(provider === "ollama" || provider === "openai") && (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-fg-muted" htmlFor="base-url">
                    Base URL {provider === "openai" ? "(optional, for compatible proxies)" : ""}
                  </Label>
                  <Input
                    id="base-url"
                    className="bg-elevated"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder={
                      provider === "ollama"
                        ? "http://localhost:11434/v1"
                        : "https://api.openai.com/v1"
                    }
                  />
                </div>
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onTest}
                  disabled={testing || !model}
                  className="gap-1.5 text-fg-muted"
                >
                  {testing && <Loader2 className="size-3 animate-spin" />}
                  {testing ? "Testing…" : "Test connection"}
                </Button>
                {testResult && (
                  <span
                    className={cn("text-[11px]", testResult.ok ? "text-success" : "text-error")}
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
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep((s) => (s - 1) as Step)}
                className="text-fg-muted"
              >
                Back
              </Button>
            )}
            {step < 2 ? (
              <Button
                type="button"
                onClick={() => (step === 1 ? goModelStep() : setStep((s) => (s + 1) as Step))}
              >
                Next
              </Button>
            ) : (
              <Button type="button" onClick={onSave} disabled={saving || !model}>
                {saving ? "Saving…" : "Save"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
