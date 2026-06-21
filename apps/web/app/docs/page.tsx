import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { A, CodeBlock, DocHeader, H2, InlineCode, Li, P, Ul } from "./_components/prose";
import { DOCS_NAV } from "./_components/nav";

export const metadata: Metadata = {
  title: "Introduction",
  description:
    "Claril is an open-source, self-hostable architecture & process intelligence workbench: BPMN, Sequence, and C4 with a deterministic logic inspector and a BYOK AI co-editor.",
};

export default function DocsIndexPage() {
  return (
    <article>
      <DocHeader
        eyebrow="Introduction"
        title="What is Claril?"
        intro={
          <>
            Claril is an open-source, self-hostable architecture &amp; process intelligence workbench
            for solution architects. It doesn&apos;t just <em>draw</em> your processes and systems —
            it <em>understands</em> them.
          </>
        }
      />

      <P>
        Model <strong>BPMN</strong> processes, <strong>Sequence</strong> diagrams, and{" "}
        <strong>C4</strong> architecture in one place. A deterministic <strong>logic inspector</strong>{" "}
        catches structural defects in real time, and an <strong>AI co-editor</strong> (bring your own
        key) generates, documents, and proposes concrete edits you approve before they land. Work solo
        in a personal space or together in an organization — with comments, <InlineCode>@mentions</InlineCode>,
        and <InlineCode>.bpmn</InlineCode> / PNG / PDF export built in.
      </P>

      <H2 id="principles">Core principles</H2>
      <Ul>
        <Li>
          <strong>Understands, not just draws.</strong> A deterministic engine finds deadlocks,
          gateway mismatches, unreachable steps, and soundness violations — computed facts, not
          guesses.
        </Li>
        <Li>
          <strong>Works without AI.</strong> The full tool, including the inspector, is useful with
          zero AI configured. AI is an amplifier, never a gate.
        </Li>
        <Li>
          <strong>Bring your own AI.</strong> Provider-agnostic and BYOK. Your keys and your data
          stay where you choose.
        </Li>
        <Li>
          <strong>Self-hostable.</strong> Run the entire workbench on your own infrastructure.
        </Li>
      </Ul>

      <H2 id="concepts">Key concepts</H2>
      <Ul>
        <Li>
          <strong>Logic inspector.</strong> A pure-TypeScript rules engine (
          <InlineCode>@claril/logic-inspector</InlineCode>) that parses a diagram into a graph and
          emits <InlineCode>Finding</InlineCode>s with severity (error / warning / info), the
          offending element, and a quick-fix where possible.
        </Li>
        <Li>
          <strong>AI co-editor.</strong> Provider-agnostic advisor (
          <InlineCode>@claril/ai-advisor</InlineCode>) that receives the diagram plus the
          inspector&apos;s findings and returns typed proposals — judgment, layered on top of
          deterministic correctness.
        </Li>
        <Li>
          <strong>Asset Catalog.</strong> An organization-level, CMDB-style catalog of custom object
          types and assets that binds diagram elements to the real services that run, so your
          architecture stays grounded — and grounds the AI.
        </Li>
        <Li>
          <strong>Collaboration.</strong> Threaded comments anchored to an element or the whole
          diagram, <InlineCode>@mentions</InlineCode>, and an in-app notification bell. Async by
          design — works in personal and org spaces.
        </Li>
        <Li>
          <strong>Export.</strong> Download <InlineCode>.bpmn</InlineCode> or export{" "}
          <strong>PNG</strong> / <strong>PDF</strong> straight from the workbench top bar.
        </Li>
        <Li>
          <strong>Versioning &amp; diff.</strong> Auto and named versions; compare revisions visually
          and restore any point in time.
        </Li>
        <Li>
          <strong>Tenancy.</strong> Work solo in a <strong>Personal</strong> space, or in an{" "}
          <strong>Organization</strong> with members and role-based{" "}
          <InlineCode>Workspaces</InlineCode>, a shared catalog, and shared AI.
        </Li>
        <Li>
          <strong>CLI &amp; MCP.</strong> Run the same inspector outside the app — in CI, or wired
          into AI agents over the Model Context Protocol.
        </Li>
      </Ul>

      <H2 id="tiers">The capability tiers</H2>
      <P>Claril splits features by whether they need an AI key:</P>
      <CodeBlock title="capability tiers">
        {`T1 Core      no key    BPMN/Sequence/C4 editing, .bpmn/PNG/PDF
                       export, full logic inspector, versioning/diff,
                       comments & @mentions, catalog, CLI & MCP
T2 Enhanced  optional  AI explanation of findings, Markdown doc-gen
T3 AI-only   yes       prompt -> BPMN, conversational editing,
                       advisor critique, AI-proposed edits you review`}
      </CodeBlock>

      <H2 id="next">Keep reading</H2>
      <ul className="mt-4 grid gap-px overflow-hidden rounded-[10px] border border-hairline bg-hairline sm:grid-cols-2">
        {DOCS_NAV.filter((item) => item.href !== "/docs").map((item) => (
          <li key={item.href} className="bg-canvas">
            <Link
              href={item.href}
              className="group flex h-full flex-col gap-1 p-5 outline-none transition-colors hover:bg-panel/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                {item.label}
                <ArrowRight
                  className="size-3.5 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                  aria-hidden
                />
              </span>
              <span className="text-sm leading-relaxed text-fg-muted">{item.description}</span>
            </Link>
          </li>
        ))}
      </ul>

      <P>
        Prefer the source? Browse the repository and its <A href="/docs/self-hosting">self-hosting</A>{" "}
        guide, or jump straight to <A href="/docs/getting-started">Getting started</A>.
      </P>
    </article>
  );
}
