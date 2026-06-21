import {
  Boxes,
  GitCompareArrows,
  KeyRound,
  type LucideIcon,
  ScanSearch,
  Sparkles,
  TerminalSquare,
} from "lucide-react";

type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
  accent?: boolean;
};

const features: Feature[] = [
  {
    icon: ScanSearch,
    title: "Deterministic inspector",
    description:
      "A rules engine — not a model — finds deadlocks, unreachable steps, and soundness violations. Fly-to the offending element and apply a quick-fix.",
  },
  {
    icon: Sparkles,
    title: "AI co-editor",
    description:
      "Chat about the diagram, generate documentation, request a review, or have the AI propose concrete edits you approve before they land.",
    accent: true,
  },
  {
    icon: KeyRound,
    title: "BYOK, provider-agnostic",
    description:
      "Bring your own key for Anthropic, OpenAI, Google, Mistral, Ollama, or OpenRouter. Your keys, your data, no lock-in.",
  },
  {
    icon: Boxes,
    title: "Asset Catalog",
    description:
      "A CMDB-style catalog binds diagram elements to real services, so your architecture stays grounded in what actually runs.",
  },
  {
    icon: GitCompareArrows,
    title: "Versioning & diff",
    description:
      "Every change is versioned. Compare revisions with a visual diff on the canvas and restore any point in time.",
  },
  {
    icon: TerminalSquare,
    title: "CLI & MCP lint",
    description:
      "Run the same inspector in CI or wire it into agents over MCP. Catch structural problems before they reach review.",
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-widest text-accent">Capabilities</p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            Deterministic first. AI that actually edits.
          </h2>
          <p className="mt-4 text-pretty text-base text-fg-muted">
            The inspector is the moat: structural correctness you can trust because it is computed,
            not guessed. The AI layer is progressive enhancement on top.
          </p>
        </div>

        <ul className="mt-12 grid gap-px overflow-hidden rounded-[10px] border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, description, accent }) => (
            <li
              key={title}
              className="group relative flex flex-col gap-3 bg-canvas p-6 transition-colors hover:bg-panel/50"
            >
              <span
                className={
                  accent
                    ? "inline-flex size-9 items-center justify-center rounded-md border border-accent/40 bg-accent/10 text-accent"
                    : "inline-flex size-9 items-center justify-center rounded-md border border-hairline bg-elevated text-fg-muted transition-colors group-hover:text-fg"
                }
              >
                <Icon className="size-4.5" aria-hidden />
              </span>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
                {title}
                {accent ? (
                  <span
                    className="font-mono text-[10px] text-accent"
                    title="AI makes this better"
                    aria-label="AI-enhanced feature"
                  >
                    ✦
                  </span>
                ) : null}
              </h3>
              <p className="text-pretty text-sm leading-relaxed text-fg-muted">{description}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
