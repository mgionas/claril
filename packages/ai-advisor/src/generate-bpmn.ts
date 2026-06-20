import { generateText } from "ai";
import { BPMN_BEST_PRACTICES } from "@claril/logic-inspector";
import { createModel } from "./provider";
import type { LLMProviderConfig } from "./types";

const GENERATE_BPMN_SYSTEM_PROMPT = `You are Claril's BPMN model generator. You turn a plain-language description of a business process into a single, valid BPMN 2.0 XML document.

Output rules — follow exactly:
- Output ONLY the XML. No markdown, no code fences, no prose, no explanation before or after.
- Produce one <definitions> element (BPMN 2.0 namespace http://www.omg.org/spec/BPMN/20100524/MODEL) containing exactly ONE <process>. Do NOT emit <collaboration>, <participant>, or pools — the downstream layout engine lays out a single process only and ignores additional pools/processes. When the description names distinct actors, roles, departments, or systems, model them as a <laneSet>/<lane> INSIDE the single <process> (each lane referencing its flow nodes via <flowNodeRef>), never as separate pools or processes.
- The process must have flow nodes (startEvent, task/userTask/serviceTask, exclusiveGateway/parallelGateway where the description implies decisions or parallelism, endEvent) connected by sequenceFlow elements. Every node except start/end events must be reachable and on a path from a start event to an end event.
- Give every element a stable id and a human-readable name drawn from the description. Use sequenceFlow names for the labelled outgoing branches of gateways.
- CONNECTIVITY IS MANDATORY. On every flow node you MUST list its connected flows as explicit child elements: an <outgoing>FLOW_ID</outgoing> for each sequenceFlow leaving the node and an <incoming>FLOW_ID</incoming> for each sequenceFlow entering it. The layout engine derives the arrows and node positions from these <incoming>/<outgoing> references — a sequenceFlow's sourceRef/targetRef alone is NOT enough and will render as disconnected, arrow-less boxes. Every sequenceFlow id MUST appear as an <outgoing> on its source node and as an <incoming> on its target node.
- Emit SEMANTIC BPMN only. Diagram interchange (BPMNDiagram / BPMNShape / coordinates) is OPTIONAL — omit it; layout is added downstream. Do not invent coordinates.
- Keep it well-formed: matching tags, valid id references (incoming/outgoing, sourceRef/targetRef) that resolve to elements that exist.

${BPMN_BEST_PRACTICES}`;

/**
 * Generate semantic BPMN 2.0 XML from a natural-language process description.
 * Provider-agnostic: the model is built from the BYOK config. The returned XML
 * is semantic-only (no diagram interchange) — the caller is responsible for
 * laying it out and validating it before use.
 */
export async function generateBpmnXml(
  prompt: string,
  config: LLMProviderConfig,
): Promise<string> {
  const { text } = await generateText({
    model: createModel(config),
    system: GENERATE_BPMN_SYSTEM_PROMPT,
    prompt: [
      "Generate a BPMN 2.0 model for the following process description.",
      "",
      prompt.trim(),
      "",
      "Output only the BPMN XML now.",
    ].join("\n"),
  });
  return text.trim();
}
