/** BPMN fixtures for CLI / lint-pipeline tests. */

/** Well-formed: start -> task -> end. Yields zero findings. */
export const validXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  id="Definitions_1" targetNamespace="http://claril.dev/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1" name="Review request">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="EndEvent_1" name="Done">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

/**
 * Known-bad: no end event (-> error), an unreachable "Orphan" task (-> error),
 * and an unlabeled splitting gateway (-> warning). Must drive a non-zero exit.
 */
export const invalidXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  id="Definitions_bad" targetNamespace="http://claril.dev/bpmn">
  <bpmn:process id="Process_bad" isExecutable="false">
    <bpmn:startEvent id="Start_1" name="Start">
      <bpmn:outgoing>F1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:exclusiveGateway id="Gw_1">
      <bpmn:incoming>F1</bpmn:incoming>
      <bpmn:outgoing>F2</bpmn:outgoing>
      <bpmn:outgoing>F3</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:task id="Task_A" name="Approve">
      <bpmn:incoming>F2</bpmn:incoming>
    </bpmn:task>
    <bpmn:task id="Task_B" name="Reject">
      <bpmn:incoming>F3</bpmn:incoming>
    </bpmn:task>
    <bpmn:task id="Orphan" name="Never reached" />
    <bpmn:sequenceFlow id="F1" sourceRef="Start_1" targetRef="Gw_1" />
    <bpmn:sequenceFlow id="F2" sourceRef="Gw_1" targetRef="Task_A" />
    <bpmn:sequenceFlow id="F3" sourceRef="Gw_1" targetRef="Task_B" />
  </bpmn:process>
</bpmn:definitions>`;

/** Not BPMN at all. */
export const notBpmnXml = `<?xml version="1.0" encoding="UTF-8"?><root><hello/></root>`;
