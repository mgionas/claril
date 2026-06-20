import { describe, expect, it } from "vitest";
import { layoutProcess } from "bpmn-auto-layout";
import { parseBpmnXml, BpmnParseError } from "../src/index";

/**
 * Regression tests for the "Generate with AI" pipeline used by
 * `apps/web/lib/actions.ts#generateDiagramFromPrompt`:
 *
 *   stripCodeFences -> layoutProcess (bpmn-auto-layout) -> parseBpmnXml + connectivity guard
 *
 * Root cause this guards against: `bpmn-auto-layout` derives node positions and
 * the BPMN DI *edges* from each flow node's explicit <incoming>/<outgoing>
 * child references — NOT from a sequenceFlow's sourceRef/targetRef alone. When
 * the LLM emits sequenceFlow-only BPMN, layout succeeds but produces zero edges,
 * so the diagram renders as disconnected, arrow-less boxes. And for a
 * <collaboration> with multiple pools, the engine lays out only the FIRST
 * <process>, dropping every other pool.
 *
 * `stripCodeFences` and `countDiEdges` mirror the pure helpers in
 * `apps/web/lib/actions.ts` (kept in sync; they are the contract under test).
 * `generateDiagramFromPrompt` itself is a `"use server"` action and can't be
 * imported into a node test, so we exercise the identical deterministic chain.
 */

function stripCodeFences(raw: string): string {
  const text = raw.trim();
  const fenced = /```(?:xml|bpmn)?\s*\n?([\s\S]*?)```/i.exec(text);
  if (fenced?.[1]) return fenced[1].trim();
  if (text.startsWith("```")) {
    const firstNewline = text.indexOf("\n");
    return firstNewline === -1 ? "" : text.slice(firstNewline + 1).trim();
  }
  return text;
}

function countDiEdges(xml: string): number {
  return (xml.match(/<[\w-]*:?BPMNEdge[\s/>]/g) ?? []).length;
}

/** The post-layout assertion `generateDiagramFromPrompt` makes after parse. */
async function runPipeline(rawLlmOutput: string) {
  const semantic = stripCodeFences(rawLlmOutput);
  const laidOut = await layoutProcess(semantic);
  const parsed = await parseBpmnXml(laidOut);
  const flowCount = parsed.graph.flows.length;
  const renderable = flowCount > 0 && countDiEdges(laidOut) >= flowCount;
  return { laidOut, parsed, flowCount, edges: countDiEdges(laidOut), renderable };
}

const NS = `xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"`;

/** A single process WITHOUT <incoming>/<outgoing> — the broken-by-default case. */
const SINGLE_NO_INOUT = `<?xml version="1.0" encoding="UTF-8"?>
<definitions ${NS} targetNamespace="http://claril">
  <process id="Process_1" isExecutable="false">
    <startEvent id="Start_1" name="Start"/>
    <task id="Task_1" name="Do work"/>
    <endEvent id="End_1" name="End"/>
    <sequenceFlow id="f1" sourceRef="Start_1" targetRef="Task_1"/>
    <sequenceFlow id="f2" sourceRef="Task_1" targetRef="End_1"/>
  </process>
</definitions>`;

/** The same process WITH explicit connectivity — what the fixed prompt asks for. */
const SINGLE_WITH_INOUT = `<?xml version="1.0" encoding="UTF-8"?>
<definitions ${NS} targetNamespace="http://claril">
  <process id="Process_1" isExecutable="false">
    <startEvent id="Start_1" name="Start"><outgoing>f1</outgoing></startEvent>
    <task id="Task_1" name="Do work"><incoming>f1</incoming><outgoing>f2</outgoing></task>
    <endEvent id="End_1" name="End"><incoming>f2</incoming></endEvent>
    <sequenceFlow id="f1" sourceRef="Start_1" targetRef="Task_1"/>
    <sequenceFlow id="f2" sourceRef="Task_1" targetRef="End_1"/>
  </process>
</definitions>`;

/** Two pools — bpmn-auto-layout only lays out the first process. */
const TWO_POOLS = `<?xml version="1.0" encoding="UTF-8"?>
<definitions ${NS} targetNamespace="http://claril">
  <collaboration id="Collab_1">
    <participant id="P_C" name="Customer" processRef="Process_C"/>
    <participant id="P_V" name="Vendor" processRef="Process_V"/>
  </collaboration>
  <process id="Process_C" isExecutable="false">
    <startEvent id="C_S"><outgoing>cf1</outgoing></startEvent>
    <task id="C_O"><incoming>cf1</incoming><outgoing>cf2</outgoing></task>
    <endEvent id="C_E"><incoming>cf2</incoming></endEvent>
    <sequenceFlow id="cf1" sourceRef="C_S" targetRef="C_O"/>
    <sequenceFlow id="cf2" sourceRef="C_O" targetRef="C_E"/>
  </process>
  <process id="Process_V" isExecutable="false">
    <startEvent id="V_S"><outgoing>vf1</outgoing></startEvent>
    <task id="V_O"><incoming>vf1</incoming><outgoing>vf2</outgoing></task>
    <endEvent id="V_E"><incoming>vf2</incoming></endEvent>
    <sequenceFlow id="vf1" sourceRef="V_S" targetRef="V_O"/>
    <sequenceFlow id="vf2" sourceRef="V_O" targetRef="V_E"/>
  </process>
</definitions>`;

describe("generate-with-ai pipeline", () => {
  it("(a) single process WITHOUT <incoming>/<outgoing> lays out but is NOT renderable (no edges)", async () => {
    const r = await runPipeline(SINGLE_NO_INOUT);
    // Layout + parse both succeed (it is valid BPMN)...
    expect(r.parsed.graph.nodes.length).toBe(3);
    expect(r.flowCount).toBe(2);
    // ...but the engine produced zero edges -> the connectivity guard rejects it.
    expect(r.edges).toBe(0);
    expect(r.renderable).toBe(false);
  });

  it("single process WITH <incoming>/<outgoing> produces a fully connected, renderable diagram", async () => {
    const r = await runPipeline(SINGLE_WITH_INOUT);
    expect(r.flowCount).toBe(2);
    expect(r.edges).toBe(2);
    expect(r.renderable).toBe(true);
  });

  it("(c) output wrapped in ```xml fences is unwrapped and lays out the same", async () => {
    const fenced = "Here is the BPMN you asked for:\n```xml\n" + SINGLE_WITH_INOUT + "\n```";
    const r = await runPipeline(fenced);
    expect(r.parsed.graph.nodes.length).toBe(3);
    expect(r.renderable).toBe(true);
  });

  it("(b) collaboration with two pools only lays out the first process -> NOT fully renderable", async () => {
    const r = await runPipeline(TWO_POOLS);
    // bpmn-moddle still parses all flows across both processes...
    expect(r.flowCount).toBe(4);
    // ...but the layout engine drew DI only for the first pool (2 edges), so the
    // connectivity guard rejects the partially-laid-out collaboration.
    expect(r.edges).toBeLessThan(r.flowCount);
    expect(r.renderable).toBe(false);
    // The Vendor pool's nodes never received DI shapes.
    expect(r.laidOut).not.toContain('bpmnElement="V_S"');
  });

  it("(d) output that already contains DI parses cleanly", async () => {
    const withDi = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" targetNamespace="http://claril">
  <process id="Process_1" isExecutable="false">
    <startEvent id="Start_1" name="Start"><outgoing>f1</outgoing></startEvent>
    <endEvent id="End_1" name="End"><incoming>f1</incoming></endEvent>
    <sequenceFlow id="f1" sourceRef="Start_1" targetRef="End_1"/>
  </process>
  <bpmndi:BPMNDiagram id="D1">
    <bpmndi:BPMNPlane id="Pl1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="s1" bpmnElement="Start_1"><dc:Bounds x="100" y="100" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="s2" bpmnElement="End_1"><dc:Bounds x="300" y="100" width="36" height="36"/></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>`;
    const r = await runPipeline(withDi);
    expect(r.parsed.graph.nodes.length).toBe(2);
    expect(r.flowCount).toBe(1);
    // bpmn-auto-layout re-lays the process and emits an edge for the flow.
    expect(r.renderable).toBe(true);
  });

  it("a process with no flows at all is rejected by the guard", async () => {
    const lonely = `<?xml version="1.0" encoding="UTF-8"?>
<definitions ${NS} targetNamespace="http://claril">
  <process id="Process_1" isExecutable="false">
    <startEvent id="Start_1" name="Start"/>
  </process>
</definitions>`;
    const r = await runPipeline(lonely);
    expect(r.flowCount).toBe(0);
    expect(r.renderable).toBe(false);
  });

  it("non-BPMN XML is rejected by parseBpmnXml with BpmnParseError", async () => {
    await expect(parseBpmnXml("<not-bpmn/>")).rejects.toBeInstanceOf(BpmnParseError);
  });
});
