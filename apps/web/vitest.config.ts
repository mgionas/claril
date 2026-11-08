import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Resolve the `@/*` → `./*` path alias (see tsconfig.json) so unit tests can
// import app modules with the same convention as production code. Without this,
// vitest can't follow `@/lib/...` imports and tests would have to use relative
// paths that diverge from the rest of the codebase.
const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: root }],
  },
  // tsconfig.json sets jsx:"preserve" (Next.js transforms it at build time via
  // SWC). Vite 8's default oxc transform mirrors that for app code, so .tsx
  // test subjects fail to parse under vitest unless we override it here —
  // test-only, doesn't affect the Next.js build pipeline.
  oxc: {
    jsx: { runtime: "automatic" },
  },
});
