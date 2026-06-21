import { PenLine, ScanSearch, Wand2 } from "lucide-react";

const steps = [
  {
    icon: PenLine,
    title: "Draw",
    description:
      "Model your process or architecture in BPMN, Sequence, or C4 on a fast, polished canvas.",
  },
  {
    icon: ScanSearch,
    title: "Inspect",
    description:
      "The deterministic inspector flags deadlocks, unreachable steps, and soundness issues in real time — with quick-fixes.",
  },
  {
    icon: Wand2,
    title: "Let AI edit",
    description:
      "Ask the co-editor to document, review, or fix it. Review the proposed edit, then apply with one click.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-t border-hairline py-20 sm:py-28">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-widest text-accent">How it works</p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            From sketch to sound in three steps
          </h2>
        </div>

        <ol className="mt-12 grid gap-6 sm:grid-cols-3">
          {steps.map(({ icon: Icon, title, description }) => (
            <li
              key={title}
              className="relative rounded-[10px] border border-hairline bg-panel/40 p-6 backdrop-blur"
            >
              <span className="inline-flex size-9 items-center justify-center rounded-md border border-hairline bg-elevated text-accent">
                <Icon className="size-4.5" aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-semibold text-fg">{title}</h3>
              <p className="mt-2 text-pretty text-sm leading-relaxed text-fg-muted">{description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
