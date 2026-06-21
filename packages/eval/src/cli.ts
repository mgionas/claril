import { writeFileSync } from "node:fs";
import { DEFAULT_MODELS, type AiProvider, type LLMProviderConfig } from "@claril/ai-advisor";
import { cases as allCases } from "../fixtures/index";
import { run } from "./run";
import { aggregate, renderConsole } from "./report";

/** Read `--name value` from argv, or undefined when absent. */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const provider = (arg("provider") ?? process.env.EVAL_PROVIDER ?? "openrouter") as AiProvider;
const model = arg("model") ?? process.env.EVAL_MODEL ?? DEFAULT_MODELS[provider];
const apiKey =
  process.env.EVAL_API_KEY ?? process.env[`${provider.toUpperCase()}_API_KEY`];
const baseUrl = process.env.EVAL_BASE_URL;
const samples = Number(arg("samples") ?? 1);
const threshold = Number(arg("threshold") ?? 0);
const only = arg("case");
const tag = arg("tag");
const jsonPath = arg("json");

// Local providers (Ollama) don't need a key; everything else is BYOK. Fail
// fast with a clear message before we spend a single token.
if (!apiKey && provider !== "ollama") {
  console.error(
    `No API key for provider "${provider}". Set EVAL_API_KEY (or ${provider.toUpperCase()}_API_KEY) — this is BYOK.`,
  );
  process.exit(1);
}

const config: LLMProviderConfig = {
  provider,
  model,
  ...(apiKey ? { apiKey } : {}),
  ...(baseUrl ? { baseUrl } : {}),
};

const selected = allCases
  .filter((c) => (only ? c.id === only : true))
  .filter((c) => (tag ? c.tags.includes(tag) : true));

if (selected.length === 0) {
  console.error(
    `No cases matched${only ? ` --case ${only}` : ""}${tag ? ` --tag ${tag}` : ""}.`,
  );
  process.exit(1);
}

const results = await run(selected, config, samples);
const report = aggregate(results);
console.log(renderConsole(report));

if (jsonPath) writeFileSync(jsonPath, JSON.stringify(report, null, 2));

if (report.passRate < threshold) process.exit(1);
