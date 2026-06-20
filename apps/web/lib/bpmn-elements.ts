import {
  AlertTriangle,
  Asterisk,
  Boxes,
  Circle,
  CircleDot,
  CircleStop,
  CircleX,
  Clock,
  Code,
  Columns3,
  Database,
  Diamond,
  File,
  GitFork,
  GitMerge,
  Group,
  Hand,
  Inbox,
  type LucideIcon,
  Mail,
  PhoneCall,
  Scale,
  Send,
  Settings,
  Square,
  Type,
  User,
} from "lucide-react";

/** A creatable BPMN element, grouped logically for the element picker. */
export interface ElementSpec {
  label: string;
  type: string;
  Icon: LucideIcon;
  eventDefinitionType?: string;
  isExpanded?: boolean;
  participant?: boolean;
}

export interface ElementGroup {
  label: string;
  items: ElementSpec[];
}

/** Logical groups, mirroring how bpmn.io separates elements/events/objects. */
export const ELEMENT_GROUPS: ElementGroup[] = [
  {
    label: "Events",
    items: [
      { label: "Start event", type: "bpmn:StartEvent", Icon: Circle },
      { label: "Message start", type: "bpmn:StartEvent", eventDefinitionType: "bpmn:MessageEventDefinition", Icon: Mail },
      { label: "Timer start", type: "bpmn:StartEvent", eventDefinitionType: "bpmn:TimerEventDefinition", Icon: Clock },
      { label: "Intermediate throw", type: "bpmn:IntermediateThrowEvent", Icon: CircleDot },
      {
        label: "Intermediate catch (message)",
        type: "bpmn:IntermediateCatchEvent",
        eventDefinitionType: "bpmn:MessageEventDefinition",
        Icon: Mail,
      },
      { label: "End event", type: "bpmn:EndEvent", Icon: CircleStop },
      { label: "Message end", type: "bpmn:EndEvent", eventDefinitionType: "bpmn:MessageEventDefinition", Icon: Mail },
      { label: "Error end", type: "bpmn:EndEvent", eventDefinitionType: "bpmn:ErrorEventDefinition", Icon: AlertTriangle },
      { label: "Terminate end", type: "bpmn:EndEvent", eventDefinitionType: "bpmn:TerminateEventDefinition", Icon: CircleX },
    ],
  },
  {
    label: "Activities",
    items: [
      { label: "Task", type: "bpmn:Task", Icon: Square },
      { label: "User task", type: "bpmn:UserTask", Icon: User },
      { label: "Service task", type: "bpmn:ServiceTask", Icon: Settings },
      { label: "Script task", type: "bpmn:ScriptTask", Icon: Code },
      { label: "Business rule task", type: "bpmn:BusinessRuleTask", Icon: Scale },
      { label: "Send task", type: "bpmn:SendTask", Icon: Send },
      { label: "Receive task", type: "bpmn:ReceiveTask", Icon: Inbox },
      { label: "Manual task", type: "bpmn:ManualTask", Icon: Hand },
      { label: "Call activity", type: "bpmn:CallActivity", Icon: PhoneCall },
      { label: "Sub-process (expanded)", type: "bpmn:SubProcess", isExpanded: true, Icon: Boxes },
    ],
  },
  {
    label: "Gateways",
    items: [
      { label: "Exclusive gateway", type: "bpmn:ExclusiveGateway", Icon: Diamond },
      { label: "Parallel gateway", type: "bpmn:ParallelGateway", Icon: GitFork },
      { label: "Inclusive gateway", type: "bpmn:InclusiveGateway", Icon: GitMerge },
      { label: "Event-based gateway", type: "bpmn:EventBasedGateway", Icon: CircleDot },
      { label: "Complex gateway", type: "bpmn:ComplexGateway", Icon: Asterisk },
    ],
  },
  {
    label: "Data",
    items: [
      { label: "Data object", type: "bpmn:DataObjectReference", Icon: File },
      { label: "Data store", type: "bpmn:DataStoreReference", Icon: Database },
    ],
  },
  {
    label: "Participants & artifacts",
    items: [
      { label: "Pool / participant", type: "bpmn:Participant", participant: true, Icon: Columns3 },
      { label: "Group", type: "bpmn:Group", Icon: Group },
      { label: "Text annotation", type: "bpmn:TextAnnotation", Icon: Type },
    ],
  },
];
