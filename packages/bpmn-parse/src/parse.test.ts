import { describe, expect, it } from "vitest";
import { parseBpmnXml } from "./parse";

/** One pool ("Helpdesk") with two lanes; a task sits in the Frontline lane. */
const LANES = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  id="D1" targetNamespace="http://claril.dev/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_Helpdesk" name="Helpdesk" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Lane_Frontline" name="Frontline">
        <bpmn:flowNodeRef>StartEvent_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_Triage</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="Lane_Support" name="Support">
        <bpmn:flowNodeRef>EndEvent_1</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="StartEvent_1" name="Ticket opened">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_Triage" name="Triage ticket">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" name="Resolved">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_Triage" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_Triage" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

/** Two pools exchanging a message flow (no lanes). */
const TWO_POOL = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  id="D2" targetNamespace="http://claril.dev/bpmn">
  <bpmn:collaboration id="Collab_1">
    <bpmn:participant id="P_Cust" name="Customer" processRef="Proc_Cust" />
    <bpmn:participant id="P_Bank" name="Bank" processRef="Proc_Bank" />
    <bpmn:messageFlow id="MF1" name="Request" sourceRef="Cust_Send" targetRef="Bank_Recv" />
  </bpmn:collaboration>
  <bpmn:process id="Proc_Cust">
    <bpmn:task id="Cust_Send" name="Send request" />
  </bpmn:process>
  <bpmn:process id="Proc_Bank">
    <bpmn:task id="Bank_Recv" name="Receive request" />
  </bpmn:process>
</bpmn:definitions>`;

describe("parseBpmnXml — lanes & pools", () => {
  it("populates lanes with ids, names, pool and semantic flowNodeRef membership", async () => {
    const { graph } = await parseBpmnXml(LANES);

    expect(graph.pools).toEqual([{ id: "Participant_Helpdesk", name: "Helpdesk" }]);

    const support = graph.lanes?.find((l) => l.id === "Lane_Support");
    expect(support).toBeDefined();
    expect(support).toMatchObject({ id: "Lane_Support", name: "Support", pool: "Helpdesk" });
    expect(support?.nodeIds).toContain("EndEvent_1");

    const frontline = graph.lanes?.find((l) => l.id === "Lane_Frontline");
    expect(frontline?.nodeIds).toEqual(["StartEvent_1", "Task_Triage"]);
  });

  it("tags each node with its lane name and pool name", async () => {
    const { graph } = await parseBpmnXml(LANES);
    const task = graph.nodes.find((n) => n.id === "Task_Triage");
    expect(task).toMatchObject({ lane: "Frontline", pool: "Helpdesk" });
    const end = graph.nodes.find((n) => n.id === "EndEvent_1");
    expect(end).toMatchObject({ lane: "Support", pool: "Helpdesk" });
  });

  it("captures pools and message flows for a multi-pool collaboration", async () => {
    const { graph } = await parseBpmnXml(TWO_POOL);
    expect(graph.pools).toEqual([
      { id: "P_Cust", name: "Customer" },
      { id: "P_Bank", name: "Bank" },
    ]);
    expect(graph.messageFlows).toEqual([
      { id: "MF1", sourceRef: "Cust_Send", targetRef: "Bank_Recv", name: "Request" },
    ]);
    // No lanes → node.pool still resolves from its owning participant's process.
    expect(graph.nodes.find((n) => n.id === "Cust_Send")?.pool).toBe("Customer");
    expect(graph.nodes.find((n) => n.id === "Bank_Recv")?.pool).toBe("Bank");
  });

  it("omits lane/pool fields for a plain single-process diagram", async () => {
    const { graph } = await parseBpmnXml(`<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D3" targetNamespace="http://claril.dev/bpmn">
  <bpmn:process id="P">
    <bpmn:startEvent id="S" /><bpmn:task id="T" /><bpmn:endEvent id="E" />
    <bpmn:sequenceFlow id="f1" sourceRef="S" targetRef="T" />
    <bpmn:sequenceFlow id="f2" sourceRef="T" targetRef="E" />
  </bpmn:process>
</bpmn:definitions>`);
    expect(graph.lanes).toBeUndefined();
    expect(graph.pools).toBeUndefined();
    expect(graph.nodes.every((n) => n.lane === undefined && n.pool === undefined)).toBe(true);
  });
});
