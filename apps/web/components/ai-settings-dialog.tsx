"use client";

import Link from "next/link";
import type { AiProvider } from "@claril/ai-advisor";
import { AiConnectionsManager } from "@/components/ai/ai-connections-manager";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AiSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  /** Provider whose card should start expanded (when not yet connected). */
  initialProvider?: string;
}

export function AiSettingsDialog({ open, onClose, initialProvider }: AiSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        aria-label="AI providers"
        className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden rounded-[10px] border-hairline bg-panel/95 p-6 backdrop-blur-md"
      >
        <DialogHeader className="text-left">
          <DialogTitle className="text-base font-medium">AI providers</DialogTitle>
          <DialogDescription className="text-sm text-fg-muted">
            Connect one or more providers — keys are stored encrypted, per organization. Pick which
            model your org uses by default. Claril works fully without AI.
          </DialogDescription>
        </DialogHeader>

        {open && (
          <div className="-mr-2 mt-4 min-h-0 flex-1 overflow-y-auto pr-2">
            <AiConnectionsManager initialProvider={initialProvider as AiProvider | undefined} />
          </div>
        )}

        <div className="mt-5 flex items-center justify-between border-t border-hairline pt-4">
          <Link
            href="/settings/ai"
            onClick={onClose}
            className="text-xs text-fg-subtle transition-colors hover:text-fg-muted"
          >
            Manage in settings →
          </Link>
          <Button type="button" variant="ghost" onClick={onClose} className="text-fg-muted">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
