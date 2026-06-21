import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type Status = { kind: "success" | "error"; message: string } | null;

/** Page-level title + supporting copy for a settings sub-page. */
export function SettingsHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-medium tracking-tight text-fg">{title}</h2>
      {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
    </div>
  );
}

/** A frosted, hairline-bordered panel used to group form fields. */
export function SettingsCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[10px] border border-hairline bg-panel/60 p-5 backdrop-blur",
        "flex flex-col gap-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Inline success/error feedback shown after a mutation. */
export function StatusBanner({ status }: { status: Status }) {
  if (!status) return null;
  const isError = status.kind === "error";
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "mt-4 flex items-center gap-2 rounded-[8px] border px-3 py-2 text-sm",
        isError
          ? "border-error/30 bg-error/10 text-error"
          : "border-success/30 bg-success/10 text-success",
      )}
    >
      {isError ? (
        <AlertCircle className="size-4 shrink-0" />
      ) : (
        <CheckCircle2 className="size-4 shrink-0" />
      )}
      <span>{status.message}</span>
    </div>
  );
}

/** Initials-based avatar; falls back to a colored circle. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full border border-hairline bg-elevated text-xs font-medium text-fg-muted",
        className,
      )}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/** Compact role pill. Owner is accented; others stay neutral. */
export function RoleBadge({ role }: { role: string }) {
  const label = role.charAt(0).toUpperCase() + role.slice(1);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
        role === "owner"
          ? "border-accent/30 bg-accent/10 text-accent"
          : "border-hairline bg-elevated text-fg-muted",
      )}
    >
      {label}
    </span>
  );
}
