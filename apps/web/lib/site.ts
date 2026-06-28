/**
 * Shared site-wide constants (URLs, external links) used by the marketing
 * surface and docs. Keep this the single source of truth so the GitHub URL
 * and friends are never duplicated as placeholders across components.
 */
export const SITE = {
  /** Canonical repository URL. */
  githubUrl: "https://github.com/mgionas/claril",
  /** Public docs entry point. */
  docsUrl: "/docs",
  /** Where alpha users send feedback / file issues. */
  feedbackUrl: "https://github.com/mgionas/claril/issues",
} as const;

/* ---- SEO / metadata (App Router) ----
   Override the URL per environment with NEXT_PUBLIC_SITE_URL; defaults to the
   production domain. Consumed by root metadata, robots, sitemap, manifest, the
   OG image, and JSON-LD. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://claril.dev").replace(
  /\/$/,
  "",
);

export const SITE_NAME = "Claril";

export const SITE_TAGLINE = "Architecture diagrams that check themselves";

export const SITE_DESCRIPTION =
  "Claril is an open-source, self-hostable AI architecture-intelligence workbench. Draw BPMN, Sequence, and C4; a deterministic inspector catches deadlocks and unreachable steps; an AI co-editor proposes edits you approve. Bring your own key.";

export const SITE_KEYWORDS = [
  "BPMN",
  "BPMN editor",
  "BPMN tool",
  "Sequence diagram",
  "C4 model",
  "architecture diagrams",
  "process intelligence",
  "workflow analysis",
  "deadlock detection",
  "soundness checking",
  "AI diagram editor",
  "diagram as code",
  "open source",
  "self-hostable",
  "bpmn-js",
];
