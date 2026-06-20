"use client";

import {
  Box,
  Circle,
  CircleDot,
  Code2,
  Cog,
  Diamond,
  Flag,
  GitFork,
  Mail,
  PhoneCall,
  Play,
  Send,
  Square,
  User,
  type LucideIcon,
} from "lucide-react";
import type { Severity } from "@claril/shared";
import { cn } from "@/lib/utils";

/** BPMN node type → a representative icon (best-effort; falls back to Box). */
const TYPE_ICON: Record<string, LucideIcon> = {
  startEvent: Play,
  endEvent: Flag,
  intermediateEvent: Circle,
  intermediateThrowEvent: Circle,
  intermediateCatchEvent: CircleDot,
  task: Square,
  userTask: User,
  serviceTask: Cog,
  sendTask: Send,
  receiveTask: Mail,
  scriptTask: Code2,
  manualTask: Square,
  businessRuleTask: Square,
  callActivity: PhoneCall,
  exclusiveGateway: Diamond,
  inclusiveGateway: Diamond,
  eventBasedGateway: Diamond,
  complexGateway: Diamond,
  parallelGateway: GitFork,
  subProcess: Box,
};

const severityDot: Record<Severity, string> = {
  error: "bg-error",
  warning: "bg-warning",
  info: "bg-info",
};

/**
 * Inline, interactive reference to a diagram element inside a chat message.
 * Rendered in place of a markdown link `[name](#el-<id>)`. Clicking it selects
 * and flies to the element on the canvas (same affordance as the Problems
 * anchors). Shows a severity dot when the element has an open finding.
 */
export function ChatElementChip({
  id,
  label,
  type,
  severity,
  onSelect,
}: {
  id: string;
  label: string;
  type?: string;
  severity?: Severity;
  onSelect?: (id: string) => void;
}) {
  const Icon = (type && TYPE_ICON[type]) || Box;
  return (
    <button
      type="button"
      onClick={() => onSelect?.(id)}
      disabled={!onSelect}
      title={onSelect ? "Click to locate on the canvas" : undefined}
      className={cn(
        "mx-0.5 inline-flex max-w-full translate-y-[1px] items-center gap-1 rounded-[6px] border border-hairline bg-canvas px-1.5 py-0.5 align-baseline text-[0.92em] font-medium text-fg-muted no-underline transition-colors",
        onSelect && "cursor-pointer hover:border-accent/50 hover:text-accent",
      )}
    >
      <Icon className="size-3 shrink-0 text-fg-subtle" />
      <span className="truncate">{label}</span>
      {severity && <span className={cn("size-1.5 shrink-0 rounded-full", severityDot[severity])} />}
    </button>
  );
}
