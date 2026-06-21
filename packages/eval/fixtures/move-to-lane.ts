import type { EvalCase } from "../src/types";
import { all, hasOpKind, nodeCountDelta, noNewPools } from "./assert";

/**
 * A pool ("Helpdesk") with two lanes: "Frontline" and "Support". A task in the
 * Frontline lane is moved into the Support lane.
 */
const bpmn = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  id="defs_move_lane" targetNamespace="http://claril.dev/bpmn">
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
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Participant_Helpdesk_di" bpmnElement="Participant_Helpdesk" isHorizontal="true">
        <dc:Bounds x="130" y="80" width="400" height="240" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_Frontline_di" bpmnElement="Lane_Frontline" isHorizontal="true">
        <dc:Bounds x="160" y="80" width="370" height="120" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_Support_di" bpmnElement="Lane_Support" isHorizontal="true">
        <dc:Bounds x="160" y="200" width="370" height="120" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="212" y="120" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Triage_di" bpmnElement="Task_Triage">
        <dc:Bounds x="300" y="98" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="452" y="240" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="248" y="138" />
        <di:waypoint x="300" y="138" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="400" y="138" />
        <di:waypoint x="470" y="240" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

export const moveToLaneCases: EvalCase[] = [
  {
    id: "move-task-to-support-lane",
    description: "Move an existing task into a named lane without altering the flow.",
    tags: ["move", "lane"],
    baseBpmn: bpmn,
    instruction: 'Move the "Triage ticket" task (Task_Triage) into the Support lane.',
    assert: all(hasOpKind("moveToContainer"), noNewPools, nodeCountDelta(0)),
  },
];
