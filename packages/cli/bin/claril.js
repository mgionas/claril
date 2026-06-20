#!/usr/bin/env node
/**
 * Claril CLI entrypoint.
 *
 * Claril packages ship raw TypeScript (`main` -> `src/*.ts`); in the app they
 * are transpiled by Next. For the standalone CLI we register `tsx` so Node can
 * load the TS sources directly, then hand off to the typed entry in src/cli.ts.
 * When the package is built/published this shim can point at compiled JS.
 */
import { register } from "tsx/esm/api";
import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const entry = pathToFileURL(resolve(here, "../src/cli.ts")).href;

const unregister = register();
try {
  const { run } = await import(entry);
  const code = await run(process.argv.slice(2));
  process.exitCode = code;
} finally {
  unregister();
}
