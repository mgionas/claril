import { Sparkles } from "lucide-react";

/**
 * Stylized, asset-free representation of the Claril canvas: a small BPMN-like
 * flow with a deterministic finding marker and an AI co-editor card. Built with
 * SVG + divs only (no screenshot, no new deps).
 */
export function CanvasPreview() {
  return (
    <div
      aria-hidden
      className="relative isolate w-full overflow-hidden rounded-[10px] border border-hairline bg-panel/60 backdrop-blur-xl"
    >
      {/* dot grid, matching the real canvas */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />
      {/* accent glow */}
      <div className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-56 w-[28rem] -translate-x-1/2 rounded-full bg-accent/15 blur-3xl" />

      {/* window chrome */}
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-fg-subtle/40" />
        <span className="size-2.5 rounded-full bg-fg-subtle/40" />
        <span className="size-2.5 rounded-full bg-fg-subtle/40" />
        <span className="ml-2 font-mono text-[11px] text-fg-subtle">order-fulfillment.bpmn</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 font-mono text-[10px] text-accent">
          <Sparkles className="size-3" /> AI connected
        </span>
      </div>

      <div className="grid gap-px sm:grid-cols-[1fr_15rem]">
        {/* diagram */}
        <div className="relative min-h-[16rem] p-5">
          <svg viewBox="0 0 420 240" className="h-full w-full" role="img" aria-label="Diagram preview">
            {/* flows */}
            <g fill="none" stroke="#71717a" strokeWidth="1.5">
              <path d="M70 60 H130" />
              <path d="M194 60 H250" />
              <path d="M280 60 V120 H130 V96" />
              <path d="M280 60 H340" />
            </g>
            <path
              d="M70 60 H130"
              fill="none"
              stroke="#4d8dff"
              strokeWidth="1.5"
              className="marketing-flow"
            />

            {/* start event */}
            <circle cx="50" cy="60" r="16" fill="#18181b" stroke="#3f3f46" strokeWidth="1.5" />
            {/* task */}
            <rect x="130" y="44" width="64" height="32" rx="6" fill="#18181b" stroke="#3f3f46" strokeWidth="1.5" />
            <rect x="138" y="55" width="40" height="3" rx="1.5" fill="#71717a" />
            <rect x="138" y="62" width="28" height="3" rx="1.5" fill="#52525b" />
            {/* gateway (flagged) */}
            <rect
              x="264"
              y="44"
              width="32"
              height="32"
              rx="6"
              transform="rotate(45 280 60)"
              fill="#18181b"
              stroke="#f87171"
              strokeWidth="1.5"
            />
            {/* end event */}
            <circle cx="356" cy="60" r="16" fill="#18181b" stroke="#34d399" strokeWidth="2" />

            {/* lower task */}
            <rect x="98" y="96" width="64" height="32" rx="6" fill="#18181b" stroke="#3f3f46" strokeWidth="1.5" />
            <rect x="106" y="107" width="36" height="3" rx="1.5" fill="#71717a" />

            {/* finding marker on the gateway */}
            <circle cx="296" cy="44" r="6" fill="#f87171" className="marketing-pulse" />
            <circle cx="296" cy="44" r="4" fill="#f87171" />
          </svg>

          {/* finding callout */}
          <div className="absolute bottom-4 left-5 max-w-[15rem] rounded-md border border-error/40 bg-error/10 px-3 py-2">
            <p className="text-[11px] font-medium text-error">Deadlock detected</p>
            <p className="mt-0.5 text-[11px] leading-snug text-fg-muted">
              Parallel gateway join never completes. Quick-fix available.
            </p>
          </div>
        </div>

        {/* AI co-editor card */}
        <div className="flex flex-col gap-3 border-t border-hairline bg-elevated/40 p-4 sm:border-l sm:border-t-0">
          <div className="flex items-center gap-2">
            <Sparkles className="size-3.5 text-accent" />
            <span className="font-mono text-[11px] text-fg-muted">AI co-editor</span>
          </div>
          <div className="rounded-md border border-hairline bg-panel/60 p-2.5 text-[11px] leading-snug text-fg-muted">
            Convert the deadlocking parallel join to an exclusive gateway.
          </div>
          <div className="rounded-md border border-accent/30 bg-accent/5 p-2.5 text-[11px] leading-snug text-fg">
            <span className="font-medium text-accent">Proposed edit</span> — replaces 1 gateway,
            rewires 2 flows.
            <span className="mt-2 flex gap-1.5">
              <span className="rounded border border-accent/40 bg-accent/15 px-2 py-0.5 text-[10px] text-accent">
                Apply
              </span>
              <span className="rounded border border-hairline px-2 py-0.5 text-[10px] text-fg-muted">
                Discard
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
