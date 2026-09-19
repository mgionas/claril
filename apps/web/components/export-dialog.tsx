"use client";

import { useState } from "react";
import { FileImage, FileText, FileType, Loader2, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/action-feedback";
import type { ExportTheme } from "@/lib/diagram-export";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ExportFormat } from "@/components/top-bar";

const FORMATS = [
  { value: "bpmn", label: ".bpmn", hint: "Editable BPMN 2.0 XML", Icon: FileText },
  { value: "png", label: "PNG", hint: "Raster image", Icon: FileImage },
  { value: "pdf", label: "PDF", hint: "Print-ready document", Icon: FileType },
] as const;

const THEMES = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
] as const;

export function ExportDialog({
  open,
  onOpenChange,
  onExport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Resolves once the file has been handed to the browser; rejects on failure. */
  onExport: (format: ExportFormat, theme?: ExportTheme) => Promise<void> | void;
}) {
  const [format, setFormat] = useState<ExportFormat>("png");
  const [theme, setTheme] = useState<ExportTheme>("light");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsTheme = format !== "bpmn";
  const label = format === "bpmn" ? ".bpmn" : format.toUpperCase();

  // Stay open (spinner) until the file is generated — PNG/PDF rasterize and PDF
  // lazy-loads its renderer, so this can take a few seconds.
  async function handleDownload() {
    setExporting(true);
    setError(null);
    try {
      await onExport(format, needsTheme ? theme : undefined);
      toast.success(`Exported ${label}`);
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (exporting) return;
        if (!o) setError(null);
        onOpenChange(o);
      }}
    >
      <DialogContent className="border-hairline bg-panel/95 text-fg backdrop-blur sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export diagram</DialogTitle>
          <DialogDescription className="text-fg-muted">
            Choose a format. PNG and PDF render in the theme you pick.
          </DialogDescription>
        </DialogHeader>

        {/* Format */}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium text-fg-subtle">Format</legend>
          <div className="grid grid-cols-3 gap-2">
            {FORMATS.map(({ value, label, hint, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setFormat(value)}
                aria-pressed={format === value}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-[8px] border px-3 py-2.5 text-left transition-colors",
                  format === value
                    ? "border-accent/40 bg-accent/10 text-fg"
                    : "border-hairline bg-elevated/40 text-fg-muted hover:text-fg",
                )}
              >
                <Icon className="size-4" />
                <span className="text-sm font-medium">{label}</span>
                <span className="text-[11px] text-fg-subtle">{hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {/* Theme — only meaningful for raster formats */}
        <fieldset className={cn("flex flex-col gap-2", !needsTheme && "pointer-events-none opacity-40")}>
          <legend className="mb-1 text-xs font-medium text-fg-subtle">Appearance</legend>
          <div className="grid grid-cols-2 gap-2">
            {THEMES.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                disabled={!needsTheme}
                onClick={() => setTheme(value)}
                aria-pressed={theme === value}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-[8px] border px-3 py-2 text-sm transition-colors",
                  needsTheme && theme === value
                    ? "border-accent/40 bg-accent/10 text-fg"
                    : "border-hairline bg-elevated/40 text-fg-muted hover:text-fg",
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="text-xs text-destructive">
            Export failed: {error}
          </p>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={exporting}
            aria-busy={exporting || undefined}
            className="flex items-center gap-2 rounded-[6px] bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {exporting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {exporting
              ? `Exporting ${label}…`
              : `Download ${format === "bpmn" ? ".bpmn" : `${label} (${theme})`}`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
