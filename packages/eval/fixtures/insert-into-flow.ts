import type { EvalCase } from "../src/types";
import { all, hasOpKind, nodeCountDelta } from "./assert";

/** A -> B. Insert a "Review" step between them (splits the A->B flow). */
const bpmn = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  id="defs_insert_flow" targetNamespace="http://claril.dev/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>Flow_start</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_A" name="Draft document">
      <bpmn:incoming>Flow_start</bpmn:incoming>
      <bpmn:outgoing>Flow_AB</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Task_B" name="Publish document">
      <bpmn:incoming>Flow_AB</bpmn:incoming>
      <bpmn:outgoing>Flow_end</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" name="Published">
      <bpmn:incoming>Flow_end</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_start" sourceRef="StartEvent_1" targetRef="Task_A" />
    <bpmn:sequenceFlow id="Flow_AB" sourceRef="Task_A" targetRef="Task_B" />
    <bpmn:sequenceFlow id="Flow_end" sourceRef="Task_B" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="160" y="100" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_A_di" bpmnElement="Task_A">
        <dc:Bounds x="250" y="78" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_B_di" bpmnElement="Task_B">
        <dc:Bounds x="410" y="78" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="572" y="100" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_start_di" bpmnElement="Flow_start">
        <di:waypoint x="196" y="118" />
        <di:waypoint x="250" y="118" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_AB_di" bpmnElement="Flow_AB">
        <di:waypoint x="350" y="118" />
        <di:waypoint x="410" y="118" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_end_di" bpmnElement="Flow_end">
        <di:waypoint x="510" y="118" />
        <di:waypoint x="572" y="118" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

export const insertIntoFlowCases: EvalCase[] = [
  {
    id: "insert-review-between",
    description: "Insert a step between two tasks, splitting the connecting sequence flow.",
    tags: ["insert", "additive"],
    baseBpmn: bpmn,
    instruction:
      'Add a "Review" step between "Draft document" (Task_A) and "Publish document" (Task_B).',
    assert: all(hasOpKind("addNode"), hasOpKind("deleteElement"), nodeCountDelta(1)),
  },
];
