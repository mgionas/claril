/** A minimal, valid BPMN 2.0 diagram used as the starting canvas. */
export const defaultDiagram = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
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
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="160" y="160" width="36" height="36" />
        <bpmndi:BPMNLabel><dc:Bounds x="166" y="203" width="24" height="14" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="260" y="138" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="432" y="160" width="36" height="36" />
        <bpmndi:BPMNLabel><dc:Bounds x="440" y="203" width="22" height="14" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="196" y="178" />
        <di:waypoint x="260" y="178" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="360" y="178" />
        <di:waypoint x="432" y="178" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

/**
 * Mermaid `sequenceDiagram` seed for new Sequence diagrams. The diagram content
 * is the raw Mermaid source (text-as-code); the editor renders a live preview.
 */
export const defaultSequenceDiagram = `sequenceDiagram
    actor User
    participant API as API Service
    participant DB as Database

    User->>API: Submit request
    activate API
    API->>DB: Query records
    activate DB
    DB-->>API: Result set
    deactivate DB
    API-->>User: Response
    deactivate API`;

/**
 * Mermaid `C4Context` seed for new C4 diagrams. C4 in Mermaid is experimental
 * but round-trippable as text; the editor renders a live preview.
 */
export const defaultC4Diagram = `C4Context
    title System Context diagram

    Person(user, "User", "A user of the system")
    System(system, "Software System", "Delivers the core value")
    System_Ext(email, "Email System", "Sends notifications")

    Rel(user, system, "Uses")
    Rel(system, email, "Sends email via")`;

/** Diagram kinds Claril can create. Mirrors the DB `diagram_type` enum. */
export type DiagramKind = "bpmn" | "sequence" | "c4";

/** Starter content for a freshly created diagram of the given kind. */
export function seedForKind(kind: DiagramKind): string {
  switch (kind) {
    case "sequence":
      return defaultSequenceDiagram;
    case "c4":
      return defaultC4Diagram;
    case "bpmn":
    default:
      return defaultDiagram;
  }
}

/** Default human-readable name for a freshly created diagram of the given kind. */
export function defaultNameForKind(kind: DiagramKind): string {
  switch (kind) {
    case "sequence":
      return "Untitled sequence";
    case "c4":
      return "Untitled C4 model";
    case "bpmn":
    default:
      return "Untitled process";
  }
}
