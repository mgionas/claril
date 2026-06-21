import { GitBranch, KeyRound, Lock, ShieldCheck, Workflow } from "lucide-react";

const items = [
  { icon: Lock, label: "Self-hostable" },
  { icon: KeyRound, label: "BYOK" },
  { icon: ShieldCheck, label: "AGPL licensed" },
  { icon: Workflow, label: "BPMN · Sequence · C4" },
  { icon: GitBranch, label: "Versioned" },
];

export function TrustStrip() {
  return (
    <section aria-label="At a glance" className="border-y border-hairline bg-panel/30">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-5 sm:px-6">
        {items.map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-2 font-mono text-xs text-fg-subtle"
          >
            <Icon className="size-3.5 text-fg-muted" aria-hidden />
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}
