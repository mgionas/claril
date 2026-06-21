"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  FilePlus2,
  GitBranch,
  Loader2,
  Sparkles,
  Upload,
  Workflow,
} from "lucide-react";
import { parseBpmnXml, BpmnParseError } from "@claril/bpmn-parse";
import type { DiagramKind } from "@/lib/default-diagram";
import { createDiagram } from "@/lib/diagram-actions";
import { createPersonalDiagram } from "@/lib/personal-actions";
import { generateDiagramFromPrompt } from "@/lib/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Mode = "blank" | "generate" | "import";

const KIND_OPTIONS: {
  kind: DiagramKind;
  label: string;
  description: string;
  icon: typeof Workflow;
}[] = [
  { kind: "bpmn", label: "BPMN process", description: "bpmn-js canvas", icon: Workflow },
  { kind: "sequence", label: "Sequence", description: "Mermaid", icon: GitBranch },
  { kind: "c4", label: "C4 model", description: "Mermaid", icon: Boxes },
];

const inputClass =
  "w-full rounded-[6px] border border-hairline bg-elevated px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-accent";

interface NewDiagramDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aiConnected: boolean;
  /** Routes diagram creation to the personal vs org server action. */
  context?: "personal" | "org";
}

export function NewDiagramDialog({
  projectId,
  open,
  onOpenChange,
  aiConnected,
  context = "org",
}: NewDiagramDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Both creators share the (projectId, kind, name?, content?) signature; pick
  // by scope so personal projects write to the personal-project tree.
  const create = context === "personal" ? createPersonalDiagram : createDiagram;

  const [kind, setKind] = useState<DiagramKind>("bpmn");
  const [mode, setMode] = useState<Mode>("blank");
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state every time the dialog (re)opens.
  useEffect(() => {
    if (open) {
      setKind("bpmn");
      setMode("blank");
      setName("");
      setPrompt("");
      setError(null);
    }
  }, [open]);

  // Only BPMN supports modes beyond Blank (sequence/c4 are Mermaid text).
  const showModes = kind === "bpmn";
  const busy = pending;

  function route(id: string) {
    onOpenChange(false);
    router.push(`/d/${id}`);
  }

  function handleBlank() {
    setError(null);
    startTransition(async () => {
      try {
        const { id } = await create(projectId, kind, name);
        route(id);
      } catch (e) {
        setError(friendly(e, "Could not create the diagram."));
      }
    });
  }

  async function handleImportFile(file: File) {
    setError(null);
    let xml: string;
    try {
      xml = await file.text();
    } catch {
      setError("Could not read that file.");
      return;
    }
    try {
      await parseBpmnXml(xml);
    } catch (e) {
      if (e instanceof BpmnParseError) {
        setError(`That file isn’t valid BPMN: ${e.message}`);
      } else {
        setError("That file isn’t valid BPMN.");
      }
      return;
    }
    startTransition(async () => {
      try {
        const { id } = await create(projectId, "bpmn", name || file.name, xml);
        route(id);
      } catch (e) {
        setError(friendly(e, "Could not create the diagram."));
      }
    });
  }

  function handleGenerate() {
    const description = prompt.trim();
    if (!description) {
      setError("Describe the process you want to generate.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const xml = await generateDiagramFromPrompt(description);
        const { id } = await create(projectId, "bpmn", name, xml);
        route(id);
      } catch (e) {
        setError(friendly(e, "Generation failed. Try rephrasing your description."));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="border-hairline bg-panel/95 text-fg backdrop-blur sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New diagram</DialogTitle>
          <DialogDescription className="text-fg-muted">
            Pick a type, then start blank, generate from a description, or import a file.
          </DialogDescription>
        </DialogHeader>

        {/* Kind picker */}
        <fieldset className="flex flex-col gap-2" disabled={busy}>
          <legend className="mb-1 text-xs font-medium text-fg-subtle">Type</legend>
          <div className="grid grid-cols-3 gap-2">
            {KIND_OPTIONS.map(({ kind: k, label, description, icon: Icon }) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setKind(k);
                  setError(null);
                  if (k !== "bpmn") setMode("blank");
                }}
                aria-pressed={kind === k}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-[6px] border px-3 py-2.5 text-left transition-colors",
                  kind === k
                    ? "border-accent bg-accent/10"
                    : "border-hairline hover:border-fg-subtle",
                )}
              >
                <Icon
                  className={cn("size-4", kind === k ? "text-accent" : "text-fg-subtle")}
                />
                <span className="text-sm text-fg">{label}</span>
                <span className="text-[11px] text-fg-subtle">{description}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {/* Mode picker (BPMN only) */}
        {showModes && (
          <fieldset className="flex flex-col gap-1.5" disabled={busy}>
            <legend className="mb-1 text-xs font-medium text-fg-subtle">How to start</legend>
            <ModeRow
              active={mode === "blank"}
              onClick={() => {
                setMode("blank");
                setError(null);
              }}
              icon={FilePlus2}
              title="Blank"
              subtitle="Start from an empty starter process."
            />
            {aiConnected && (
              <ModeRow
                active={mode === "generate"}
                onClick={() => {
                  setMode("generate");
                  setError(null);
                }}
                icon={Sparkles}
                title={
                  <span className="flex items-center gap-1.5">
                    Generate with AI <span className="text-accent">✦</span>
                  </span>
                }
                subtitle="Describe the process; the AI drafts the BPMN."
              />
            )}
            <ModeRow
              active={mode === "import"}
              onClick={() => {
                setMode("import");
                setError(null);
              }}
              icon={Upload}
              title="Import .bpmn"
              subtitle="Upload an existing BPMN 2.0 file."
            />
          </fieldset>
        )}

        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="new-diagram-name" className="text-xs font-medium text-fg-subtle">
            Name <span className="text-fg-subtle/70">(optional)</span>
          </label>
          <input
            id="new-diagram-name"
            className={inputClass}
            placeholder="Untitled"
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* Generate description */}
        {showModes && mode === "generate" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-diagram-prompt" className="text-xs font-medium text-fg-subtle">
              Describe the process
            </label>
            <textarea
              id="new-diagram-prompt"
              rows={4}
              className={cn(inputClass, "resize-y")}
              placeholder="e.g. A customer submits an expense report; a manager approves or rejects it; approved reports are paid by finance."
              value={prompt}
              disabled={busy}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <p className="text-[11px] text-fg-subtle">
              ✦ AI drafts a starting point — review before sharing.
            </p>
          </div>
        )}

        {/* Import hidden input */}
        {showModes && mode === "import" && (
          <input
            ref={fileInputRef}
            type="file"
            accept=".bpmn,.xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Allow re-selecting the same file later.
              e.target.value = "";
              if (file) void handleImportFile(file);
            }}
          />
        )}

        {error && (
          <p className="rounded-[6px] border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="rounded-[6px] border border-hairline px-3 py-2 text-sm text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
          >
            Cancel
          </button>
          {(!showModes || mode === "blank") && (
            <PrimaryButton busy={busy} onClick={handleBlank}>
              Create
            </PrimaryButton>
          )}
          {showModes && mode === "generate" && (
            <PrimaryButton busy={busy} busyLabel="Generating…" onClick={handleGenerate}>
              <Sparkles className="size-4" />
              Generate
            </PrimaryButton>
          )}
          {showModes && mode === "import" && (
            <PrimaryButton busy={busy} onClick={() => fileInputRef.current?.click()}>
              <Upload className="size-4" />
              Choose file
            </PrimaryButton>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ModeRow({
  active,
  onClick,
  icon: Icon,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Workflow;
  title: React.ReactNode;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-start gap-2.5 rounded-[6px] border px-3 py-2.5 text-left transition-colors",
        active ? "border-accent bg-accent/10" : "border-hairline hover:border-fg-subtle",
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", active ? "text-accent" : "text-fg-subtle")} />
      <span className="flex flex-col">
        <span className="text-sm text-fg">{title}</span>
        <span className="text-[11px] text-fg-subtle">{subtitle}</span>
      </span>
    </button>
  );
}

function PrimaryButton({
  busy,
  busyLabel = "Working…",
  onClick,
  children,
}: {
  busy: boolean;
  busyLabel?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-[6px] bg-accent px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {busy ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {busyLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

function friendly(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) {
    if (e.message === "No AI provider configured.") {
      return "AI isn’t connected. Set up a provider in Settings, then try again.";
    }
    return e.message;
  }
  return fallback;
}
