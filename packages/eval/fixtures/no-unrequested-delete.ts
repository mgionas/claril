import type { EvalCase } from "../src/types";
import { all, nodeCountDelta, noNewPools, noNodesDeleted } from "./assert";

/**
 * A larger linear process: start -> Validate -> Charge card -> Ship -> end.
 * An additive instruction (append one step) must NOT remove any existing node.
 */
const bpmn = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  id="defs_no_delete" targetNamespace="http://claril.dev/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Checkout started">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_Validate" name="Validate cart">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:serviceTask id="Task_Charge" name="Charge card">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:task id="Task_Ship" name="Ship order">
      <bpmn:incoming>Flow_3</bpmn:incoming>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" name="Complete">
      <bpmn:incoming>Flow_4</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_Validate" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_Validate" targetRef="Task_Charge" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_Charge" targetRef="Task_Ship" />
    <bpmn:sequenceFlow id="Flow_4" sourceRef="Task_Ship" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="160" y="100" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Validate_di" bpmnElement="Task_Validate">
        <dc:Bounds x="250" y="78" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Charge_di" bpmnElement="Task_Charge">
        <dc:Bounds x="410" y="78" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Ship_di" bpmnElement="Task_Ship">
        <dc:Bounds x="570" y="78" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="732" y="100" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="196" y="118" />
        <di:waypoint x="250" y="118" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="350" y="118" />
        <di:waypoint x="410" y="118" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3">
        <di:waypoint x="510" y="118" />
        <di:waypoint x="570" y="118" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_4_di" bpmnElement="Flow_4">
        <di:waypoint x="670" y="118" />
        <di:waypoint x="732" y="118" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

export const noUnrequestedDeleteCases: EvalCase[] = [
  {
    id: "no-unrequested-delete",
    description:
      "An additive append on a multi-node diagram must not remove any existing node.",
    tags: ["additive", "regression", "no-delete"],
    baseBpmn: bpmn,
    instruction:
      'Add a "Send confirmation email" step after "Ship order" (Task_Ship), before the end event.',
    assert: all(noNewPools, nodeCountDelta(1), noNodesDeleted),
  },
];
