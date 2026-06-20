"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AiProvider } from "@claril/ai-advisor";
import { saveAiConfig } from "@/lib/actions";

const PROVIDERS: { value: AiProvider; label: string; needsKey: boolean; modelHint: string }[] = [
  { value: "anthropic", label: "Anthropic (Claude)", needsKey: true, modelHint: "claude-opus-4-8" },
  { value: "openai", label: "OpenAI", needsKey: true, modelHint: "model id" },
  { value: "google", label: "Google", needsKey: true, modelHint: "model id" },
  { value: "mistral", label: "Mistral", needsKey: true, modelHint: "model id" },
  { value: "ollama", label: "Ollama (local)", needsKey: false, modelHint: "llama3.1" },
];

const fieldClass =
  "rounded-[6px] border border-hairline bg-elevated px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-accent";

interface AiSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  initialProvider?: string;
}

export function AiSettingsDialog({ open, onClose, initialProvider }: AiSettingsDialogProps) {
  const router = useRouter();
  const [provider, setProvider] = useState<AiProvider>((initialProvider as AiProvider) ?? "anthropic");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;
  const current = PROVIDERS.find((p) => p.value === provider) ?? PROVIDERS[0];

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
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
      >
        <h2 className="text-base font-medium">AI provider</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Bring your own key — stored encrypted, per organization. Claril works fully without AI;
          this only enables the advisor and other AI features.
        </p>

        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-fg-muted">Provider</span>
            <select
              className={fieldClass}
              value={provider}
              onChange={(e) => setProvider(e.target.value as AiProvider)}
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value} className="bg-panel">
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-fg-muted">Model (optional)</span>
            <input
              className={fieldClass}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={current.modelHint}
            />
          </label>

          {provider === "ollama" && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-fg-muted">Base URL</span>
              <input
                className={fieldClass}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:11434/v1"
              />
            </label>
          )}

          {current.needsKey && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-fg-muted">API key</span>
              <input
                type="password"
                className={fieldClass}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Leave blank to keep the existing key"
                autoComplete="off"
              />
            </label>
          )}

          {error && <p className="text-sm text-error">{error}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[6px] px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-elevated"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-[6px] bg-accent px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
