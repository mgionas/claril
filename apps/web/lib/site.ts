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
