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
});
