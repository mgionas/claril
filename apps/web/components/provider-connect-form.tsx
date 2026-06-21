"use client";

import type { AiProvider } from "@claril/ai-advisor";
import { providerMeta, keyLooksValid } from "@/lib/ai-providers";
import { ModelPicker } from "@/components/ai/model-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Guided "how to connect" panel: ordered steps + a console deep-link. Used by
 * the connect form below. Pure presentation, no secrets.
 */
function HowToPanel({
  heading,
  steps,
  url,
  urlLabel,
}: {
  heading: string;
  steps: string[];
  url: string;
  urlLabel: string;
}) {
  return (
    <div className="rounded-[10px] border border-hairline bg-elevated/40 p-3">
      <p className="mb-1.5 text-[11px] font-medium text-fg-muted">{heading}</p>
      <ol className="flex list-decimal flex-col gap-1 pl-4 text-[11px] text-fg-subtle">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
      >
        Open {urlLabel} ↗
      </a>
    </div>
  );
}

export interface ProviderConnectFormProps {
  provider: AiProvider;
  apiKey: string;
  onApiKeyChange: (v: string) => void;
  baseUrl: string;
  onBaseUrlChange: (v: string) => void;
  model: string;
  onModelChange: (v: string) => void;
  disabled?: boolean;
  /** Bump to force the model list to refetch (e.g. after a key is entered). */
  refetchKey?: number;
}

/**
 * Reusable per-provider connect UI: guided how-to panel, API-key input with a
 * soft format warning, optional base-URL, and the live model picker. Fully
 * controlled — the parent owns the field state and persistence. BYOK-safe: the
 * key field placeholder hints that a blank value keeps the stored key.
 */
export function ProviderConnectForm({
  provider,
  apiKey,
  onApiKeyChange,
  baseUrl,
  onBaseUrlChange,
  model,
  onModelChange,
  disabled = false,
  refetchKey = 0,
}: ProviderConnectFormProps) {
  const meta = providerMeta(provider);
  const keyFieldId = `api-key-${provider}`;
  const baseUrlFieldId = `base-url-${provider}`;

  return (
    <div className="flex flex-col gap-3">
      {meta.needsKey ? (
        <div className="flex flex-col gap-2">
          <HowToPanel
            heading={`How to connect ${meta.label}`}
            steps={meta.steps}
            url={meta.keyUrl}
            urlLabel={meta.keyUrlLabel}
          />

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-fg-muted" htmlFor={keyFieldId}>
              API key
            </Label>
            <Input
              id={keyFieldId}
              type="password"
              className="bg-elevated"
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder={meta.keyPlaceholder ?? "Leave blank to keep the existing key"}
              autoComplete="off"
              disabled={disabled}
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
        <HowToPanel
          heading={`How to run ${meta.label}`}
          steps={meta.steps}
          url={meta.keyUrl}
          urlLabel={meta.keyUrlLabel}
        />
      )}

      {(provider === "ollama" || provider === "openai") && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-fg-muted" htmlFor={baseUrlFieldId}>
            Base URL {provider === "openai" ? "(optional, for compatible proxies)" : ""}
          </Label>
          <Input
            id={baseUrlFieldId}
            className="bg-elevated"
            value={baseUrl}
            onChange={(e) => onBaseUrlChange(e.target.value)}
            placeholder={
              provider === "ollama" ? "http://localhost:11434/v1" : "https://api.openai.com/v1"
            }
            disabled={disabled}
          />
        </div>
      )}

      <ModelPicker
        provider={provider}
        apiKey={apiKey}
        baseUrl={baseUrl}
        value={model}
        onChange={onModelChange}
        disabled={disabled}
        refetchKey={refetchKey}
      />
    </div>
  );
}
