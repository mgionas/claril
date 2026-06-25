"use client";

import { useState } from "react";
import { FileImage, FileText, FileType, Moon, Sun } from "lucide-react";
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
  onExport: (format: ExportFormat, theme?: ExportTheme) => void;
}) {
  const [format, setFormat] = useState<ExportFormat>("png");
  const [theme, setTheme] = useState<ExportTheme>("light");
  const needsTheme = format !== "bpmn";

  function handleDownload() {
    onExport(format, needsTheme ? theme : undefined);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

        <DialogFooter>
          <button
            type="button"
            onClick={handleDownload}
            className="rounded-[6px] bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Download {format === "bpmn" ? ".bpmn" : `${format.toUpperCase()} (${theme})`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
