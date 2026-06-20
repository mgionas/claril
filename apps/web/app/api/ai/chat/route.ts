import { headers } from "next/headers";
import {
  streamText,
  convertToModelMessages,
  tool,
  stepCountIs,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getOrgAiConfig, getUserOrgId } from "@/lib/ai";
import { createModel, planEdits, describeFindings, describeAssetContext } from "@claril/ai-advisor";
import { buildDiagramAssetContext } from "@/lib/catalog-grounding";
import { recordAiUsage, projectIdForDiagram } from "@/lib/ai-usage";
import { getOrRefreshSynopsis } from "@/lib/knowledge";
import { stripLoneSurrogates } from "@/lib/sanitize";
import type { Finding } from "@claril/shared";
import type { ProcessGraph } from "@claril/logic-inspector";

export const maxDuration = 60;

const BodySchema = z.object({
  messages: z.array(z.any()),
  graph: z.any(),
  findings: z.array(z.any()).default([]),
  diagramId: z.string().optional(),
});

/** Strip lone surrogates from every text part so the provider body stays valid JSON. */
function sanitizeMessages(messages: UIMessage[]): UIMessage[] {
  return messages.map((m) => ({
    ...m,
    parts: m.parts.map((p) =>
      p.type === "text" ? { ...p, text: stripLoneSurrogates(p.text) } : p,
    ),
  }));
}

const CHAT_SYSTEM = `You are Claril's AI assistant working inside a BPMN process editor.
You are given a structured summary of the process — its shape, sequence flows, decision points, and an element id↔name map — plus the deterministic inspector's findings, as FACTS and the only source of truth. Answer questions in concise Markdown, grounding every claim in the provided model. When you mention a specific element of the model, write it as a Markdown link to its id: [Element Name](#el-ELEMENT_ID) — use the element's name as the link text and its id (from the ELEMENT ID ↔ NAME map) after "#el-". The UI turns these into clickable chips that locate the element on the canvas. Do not expose raw ids in prose otherwise.
When the user asks you to CHANGE the model (add/remove/connect/rename steps, fix a finding), call the proposeEdit tool with a precise natural-language instruction instead of describing the change in prose. Do not invent steps, systems, or relationships not present.`;

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const orgId = await getUserOrgId(session.user.id);
  const config = orgId ? await getOrgAiConfig(orgId) : null;
  if (!orgId || !config) return new Response("No AI provider configured.", { status: 400 });

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const { messages, graph, findings, diagramId } = parsed.data as {
    messages: UIMessage[];
    graph: ProcessGraph;
    findings: Finding[];
    diagramId?: string;
  };

  const assetContext = diagramId
    ? await buildDiagramAssetContext(orgId, diagramId)
    : undefined;
  const projectId = diagramId ? await projectIdForDiagram(diagramId) : null;
  const synopsis = await getOrRefreshSynopsis(diagramId, graph, config.model ?? "unknown");
  const grounding = stripLoneSurrogates(
    [
      synopsis,
      "",
      "DETERMINISTIC FINDINGS (facts from the logic inspector):",
      describeFindings(findings),
      assetContext
        ? `\nBOUND ASSETS (Asset Catalog — real service semantics):\n${describeAssetContext(assetContext)}`
        : "",
    ].join("\n"),
  );

  const result = streamText({
    model: createModel(config),
    system: `${CHAT_SYSTEM}\n\nCURRENT MODEL:\n${grounding}`,
    messages: await convertToModelMessages(sanitizeMessages(messages)),
    stopWhen: stepCountIs(3),
    tools: {
      proposeEdit: tool({
        description:
          "Propose a structured set of edits to the BPMN model from a natural-language instruction. Returns a validated edit plan the UI renders as a reviewable card.",
        inputSchema: z.object({
          instruction: z
            .string()
            .describe("A precise description of the change the user asked for."),
        }),
        execute: async ({ instruction }) => {
          return planEdits({ graph, findings, instruction, assetContext }, config);
        },
      }),
    },
    onFinish: ({ usage }) => {
      void recordAiUsage({
        organizationId: orgId,
        projectId,
        diagramId,
        kind: "chat",
        provider: config.provider,
        model: config.model ?? "unknown",
        usage,
      });
    },
  });

  return result.toUIMessageStreamResponse({
    messageMetadata: ({ part }) =>
      part.type === "finish"
        ? {
            usage: {
              input: part.totalUsage.inputTokens ?? 0,
              output: part.totalUsage.outputTokens ?? 0,
            },
          }
        : undefined,
  });
}
