import { describe, expect, it } from "vitest";
import { BpmnParseError, parseBpmnXml } from "../src";
import { collaborationXml, invalidXml, notBpmnXml, validXml } from "./fixtures";

describe("parseBpmnXml", () => {
  it("parses a simple process into the expected ProcessGraph", async () => {
    const { graph } = await parseBpmnXml(validXml);

    expect(graph.id).toBe("Process_1");
    expect(graph.nodes).toEqual([
      { id: "StartEvent_1", type: "startEvent", name: "Start" },
      { id: "Task_1", type: "task", name: "Review request" },
      { id: "EndEvent_1", type: "endEvent", name: "Done" },
    ]);
    expect(graph.flows).toEqual([
      { id: "Flow_1", sourceRef: "StartEvent_1", targetRef: "Task_1", name: undefined },
      { id: "Flow_2", sourceRef: "Task_1", targetRef: "EndEvent_1", name: undefined },
    ]);
  });

  it("lowercases the moddle type to match bpmn-to-graph.ts", async () => {
    const { graph } = await parseBpmnXml(invalidXml);
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    expect(byId.get("Gw_1")?.type).toBe("exclusiveGateway");
    expect(byId.get("Task_A")?.type).toBe("task");
  });

  it("descends through collaboration + lanes and skips container types", async () => {
    const { graph } = await parseBpmnXml(collaborationXml);

    // No Participant / Lane / LaneSet / Collaboration nodes leak into the graph.
    const types = graph.nodes.map((n) => n.type);
    expect(types).not.toContain("participant");
    expect(types).not.toContain("lane");
    expect(types).not.toContain("laneSet");
    expect(types).not.toContain("collaboration");

    expect(graph.nodes).toEqual([
      { id: "Start_c", type: "startEvent", name: "Begin" },
      { id: "Task_c", type: "userTask", name: "Handle" },
      { id: "End_c", type: "endEvent", name: "Finish" },
    ]);
    expect(graph.flows.map((f) => f.id)).toEqual(["Fc1", "Fc2"]);
  });

  it("surfaces sequence flows with both endpoints only", async () => {
    const { graph } = await parseBpmnXml(invalidXml);
    expect(graph.flows.map((f) => f.id)).toEqual(["F1", "F2", "F3"]);
    expect(graph.flows.every((f) => f.sourceRef && f.targetRef)).toBe(true);
  });

  it("throws BpmnParseError when there is no definitions root", async () => {
    await expect(parseBpmnXml(notBpmnXml)).rejects.toBeInstanceOf(BpmnParseError);
  });
});
