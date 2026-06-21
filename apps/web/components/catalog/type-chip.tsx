import type { AssetType } from "@claril/db";
import { cn } from "@/lib/utils";

/**
 * Compact chip for an asset type: a colored dot + the type name. Used in the
 * listing and on the detail header. Color falls back to a neutral gray.
 */
export function TypeChip({
  type,
  className,
}: {
  type: Pick<AssetType, "name" | "color"> | null | undefined;
  className?: string;
}) {
  if (!type) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-hairline bg-elevated px-2 py-0.5 text-xs text-fg-subtle",
          className,
        )}
      >
        Unknown type
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-hairline bg-elevated px-2 py-0.5 text-xs text-fg-muted",
        className,
      )}
    >
      <span
        className="inline-block size-2 shrink-0 rounded-full"
        style={{ background: type.color ?? "#71717a" }}
      />
      {type.name}
    </span>
  );
}
