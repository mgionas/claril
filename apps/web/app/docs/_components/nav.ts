/** Ordered docs navigation — single source of truth for the sidebar + footer. */
export const DOCS_NAV: { label: string; href: string; description: string }[] = [
  {
    label: "Introduction",
    href: "/docs",
    description: "What Claril is and the core concepts.",
  },
  {
    label: "Getting started",
    href: "/docs/getting-started",
    description: "Create a project, draw, inspect, and connect AI.",
  },
  {
    label: "Self-hosting",
    href: "/docs/self-hosting",
    description: "Run the full stack with Docker or external Postgres.",
  },
  {
    label: "CLI & MCP",
    href: "/docs/cli",
    description: "Lint BPMN in CI or wire the inspector into agents.",
  },
  {
    label: "AI providers (BYOK)",
    href: "/docs/ai-providers",
    description: "Bring your own key across six providers.",
  },
];
