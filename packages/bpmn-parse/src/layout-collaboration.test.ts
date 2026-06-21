import { describe, expect, it } from "vitest";
import { layoutProcess } from "bpmn-auto-layout";
import { layoutCollaboration } from "./layout-collaboration";
import { parseBpmnXml } from "./parse";

const TWO_POOL = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collab_1">
    <bpmn:participant id="P_Cust" name="Customer" processRef="Proc_Cust"/>
    <bpmn:participant id="P_Bank" name="Bank" processRef="Proc_Bank"/>
    <bpmn:messageFlow id="MF1" name="Message Flow" sourceRef="Cust_Submit" targetRef="Bank_Recv"/>
  </bpmn:collaboration>
  <bpmn:process id="Proc_Cust" isExecutable="false">
    <bpmn:startEvent id="Cust_Start" name="Need to make payment"><bpmn:outgoing>cf1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="Cust_Submit" name="Submit payment"><bpmn:incoming>cf1</bpmn:incoming><bpmn:outgoing>cf2</bpmn:outgoing></bpmn:task>
    <bpmn:endEvent id="Cust_End" name="Payment submitted"><bpmn:incoming>cf2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="cf1" sourceRef="Cust_Start" targetRef="Cust_Submit"/>
    <bpmn:sequenceFlow id="cf2" sourceRef="Cust_Submit" targetRef="Cust_End"/>
  </bpmn:process>
  <bpmn:process id="Proc_Bank" isExecutable="false">
    <bpmn:startEvent id="Bank_Recv" name="Payment received"><bpmn:messageEventDefinition id="med1"/><bpmn:outgoing>bf1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="Bank_Validate" name="Validate payment"><bpmn:incoming>bf1</bpmn:incoming><bpmn:outgoing>bf2</bpmn:outgoing></bpmn:task>
    <bpmn:exclusiveGateway id="Bank_Valid" name="Payment valid?"><bpmn:incoming>bf2</bpmn:incoming><bpmn:outgoing>bf3</bpmn:outgoing><bpmn:outgoing>bf4</bpmn:outgoing></bpmn:exclusiveGateway>
    <bpmn:task id="Bank_Process" name="Process payment"><bpmn:incoming>bf3</bpmn:incoming><bpmn:outgoing>bf5</bpmn:outgoing></bpmn:task>
    <bpmn:task id="Bank_Reject" name="Reject payment"><bpmn:incoming>bf4</bpmn:incoming><bpmn:outgoing>bf6</bpmn:outgoing></bpmn:task>
    <bpmn:endEvent id="Bank_Done" name="Payment completed"><bpmn:incoming>bf5</bpmn:incoming></bpmn:endEvent>
    <bpmn:endEvent id="Bank_Rejected" name="Payment rejected"><bpmn:incoming>bf6</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="bf1" sourceRef="Bank_Recv" targetRef="Bank_Validate"/>
    <bpmn:sequenceFlow id="bf2" sourceRef="Bank_Validate" targetRef="Bank_Valid"/>
    <bpmn:sequenceFlow id="bf3" name="Yes" sourceRef="Bank_Valid" targetRef="Bank_Process"/>
    <bpmn:sequenceFlow id="bf4" name="No" sourceRef="Bank_Valid" targetRef="Bank_Reject"/>
    <bpmn:sequenceFlow id="bf5" sourceRef="Bank_Process" targetRef="Bank_Done"/>
    <bpmn:sequenceFlow id="bf6" sourceRef="Bank_Reject" targetRef="Bank_Rejected"/>
  </bpmn:process>
</bpmn:definitions>`;

const SINGLE_PROCESS = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D2" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Proc_1" isExecutable="false">
    <bpmn:startEvent id="S1" name="Start"><bpmn:outgoing>f1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="T1" name="Do work"><bpmn:incoming>f1</bpmn:incoming><bpmn:outgoing>f2</bpmn:outgoing></bpmn:task>
    <bpmn:endEvent id="E1" name="End"><bpmn:incoming>f2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="f1" sourceRef="S1" targetRef="T1"/>
    <bpmn:sequenceFlow id="f2" sourceRef="T1" targetRef="E1"/>
  </bpmn:process>
</bpmn:definitions>`;

/** Pull each <bpmndi:BPMNShape bpmnElement="X" .../> with its bounds from XML. */
function shapeBoundsById(xml: string): Map<string, { x: number; y: number; width: number; height: number }> {
  const map = new Map<string, { x: number; y: number; width: number; height: number }>();
  const shapeRe = /<(?:\w+:)?BPMNShape\b[^>]*\bbpmnElement="([^"]+)"[^>]*>([\s\S]*?)<\/(?:\w+:)?BPMNShape>/g;
  for (const m of xml.matchAll(shapeRe)) {
    const id = m[1];
    const bm = m[2].match(/<(?:\w+:)?Bounds\b[^>]*\bx="([\d.-]+)"[^>]*\by="([\d.-]+)"[^>]*\bwidth="([\d.-]+)"[^>]*\bheight="([\d.-]+)"/);
    if (bm) {
      map.set(id, { x: +bm[1], y: +bm[2], width: +bm[3], height: +bm[4] });
    }
  }
  return map;
}

function edgeWaypointCount(xml: string, bpmnElementId: string): number {
  const re = new RegExp(
    `<(?:\\w+:)?BPMNEdge\\b[^>]*\\bbpmnElement="${bpmnElementId}"[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?BPMNEdge>`,
  );
  const m = xml.match(re);
  if (!m) return 0;
  return (m[1].match(/<(?:\w+:)?waypoint\b/g) ?? []).length;
}

describe("layoutCollaboration", () => {
  it("lays out a two-pool collaboration with stacked pools and a message-flow edge", async () => {
    const out = await layoutCollaboration(TWO_POOL);

    // Reparses cleanly via the shared parser.
    await expect(parseBpmnXml(out)).resolves.toBeDefined();

    // Collaboration preserved; both pools present on the diagram.
    expect(out).toContain("<bpmn:collaboration");
    const bounds = shapeBoundsById(out);
    expect(bounds.has("P_Cust")).toBe(true);
    expect(bounds.has("P_Bank")).toBe(true);

    // Every flow node got a shape.
    for (const id of [
      "Cust_Start",
      "Cust_Submit",
      "Cust_End",
      "Bank_Recv",
      "Bank_Validate",
      "Bank_Valid",
      "Bank_Process",
      "Bank_Reject",
      "Bank_Done",
      "Bank_Rejected",
    ]) {
      expect(bounds.has(id), `missing shape for ${id}`).toBe(true);
    }

    // The two pools do not overlap vertically (stacked).
    const cust = bounds.get("P_Cust")!;
    const bank = bounds.get("P_Bank")!;
    const disjoint =
      cust.y + cust.height <= bank.y || bank.y + bank.height <= cust.y;
    expect(disjoint, "pools overlap vertically").toBe(true);

    // Pools are aligned to the same width.
    expect(cust.width).toBe(bank.width);

    // The message flow is drawn with at least two waypoints.
    expect(edgeWaypointCount(out, "MF1")).toBeGreaterThanOrEqual(2);
  });

  it("delegates a single-process document to layoutProcess unchanged", async () => {
    const viaCollab = await layoutCollaboration(SINGLE_PROCESS);
    const viaProcess = await layoutProcess(SINGLE_PROCESS);
    expect(viaCollab).toBe(viaProcess);
  });
});
