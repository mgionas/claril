"use client";

import { type Ref } from "react";
import { Sparkles } from "lucide-react";
import type { Finding, QuickFix } from "@claril/shared";
import type { ProcessGraph } from "@claril/logic-inspector";
import type { EditPlan } from "@claril/ai-advisor";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ProblemsTab } from "@/components/problems-tab";
import { ChatTab, type ChatTabHandle } from "@/components/chat-tab";
import { cn } from "@/lib/utils";

export interface AiDrawerProps {
  open: boolean;
  aiConnected: boolean;
  findings: Finding[];
  errorCount: number;
  warningCount: number;
  focusedElementId?: string;
  focusNonce?: number;
  aiBusy?: boolean;
  // chat wiring
  chatHandleRef: Ref<ChatTabHandle>;
  activeTab: "chat" | "problems";
  onTabChange: (tab: "chat" | "problems") => void;
  getChatContext: () => { graph: ProcessGraph | null; findings: Finding[]; diagramId: string };
  initialChatMessages?: { id: string; role: string; parts: unknown }[];
  pendingProposalId: string | null;
  resolutions: Record<string, "approved" | "rolledback">;
  onProposal: (plan: EditPlan, toolCallId: string) => void;
  onApplyPlan: (toolCallId: string) => void;
  onDiscardPlan: (toolCallId: string) => void;
  onKeepRefining: (toolCallId: string) => void;
  onGenerateDocs: () => void;
  onReview: () => void;
  // problems wiring
  onSelect?: (elementId: string) => void;
  onApplyFix?: (fix: QuickFix) => void;
  onAskAiAboutFinding?: (finding: Finding) => void;
}

/**
 * In-flow, full-height drawer that shrinks the canvas (animated width). When AI
 * is connected it shows Chat + Problems tabs; otherwise it degrades to a plain
 * Problems list (the former Inspector). Toggled from the workbench tab.
 */
export function AiDrawer(props: AiDrawerProps) {
  return (
    <aside
      className={cn(
        "h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-out",
        props.open ? "w-96" : "w-0",
      )}
    >
      <div className="flex h-full w-96 flex-col border-l border-hairline bg-panel/90 backdrop-blur">
        <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
          <Sparkles className="size-4 text-accent" />
          <span className="text-sm font-medium">{props.aiConnected ? "Assistant" : "Inspector"}</span>
        </div>

        {props.aiConnected ? (
          <Tabs
            value={props.activeTab}
            onValueChange={(v) => props.onTabChange(v as "chat" | "problems")}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="mx-3 mt-2 grid grid-cols-2">
              <TabsTrigger value="chat">Chat</TabsTrigger>
              <TabsTrigger value="problems">
                Problems
                {(props.errorCount > 0 || props.warningCount > 0) && (
                  <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] text-fg-muted">
                    {props.errorCount > 0 && (
                      <span className="flex items-center gap-0.5">
                        <span className="size-1.5 rounded-full bg-error" />
                        {props.errorCount}
                      </span>
                    )}
                    {props.warningCount > 0 && (
                      <span className="flex items-center gap-0.5">
                        <span className="size-1.5 rounded-full bg-warning" />
                        {props.warningCount}
                      </span>
                    )}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="chat" className="mt-2 min-h-0 flex-1">
              <ChatTab
                handleRef={props.chatHandleRef}
                getContext={props.getChatContext}
                initialMessages={props.initialChatMessages}
                pendingProposalId={props.pendingProposalId}
                resolutions={props.resolutions}
                onProposal={props.onProposal}
                onApplyPlan={props.onApplyPlan}
                onDiscardPlan={props.onDiscardPlan}
                onKeepRefining={props.onKeepRefining}
                onGenerateDocs={props.onGenerateDocs}
                onReview={props.onReview}
                onSelectElement={props.onSelect ?? (() => {})}
              />
            </TabsContent>
            <TabsContent value="problems" className="mt-2 min-h-0 flex-1 overflow-y-auto">
              <ProblemsTab
                findings={props.findings}
                focusedElementId={props.focusedElementId}
                focusNonce={props.focusNonce}
                aiConnected
                aiBusy={props.aiBusy}
                onSelect={props.onSelect}
                onApplyFix={props.onApplyFix}
                onAskAi={props.onAskAiAboutFinding}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ProblemsTab
              findings={props.findings}
              focusedElementId={props.focusedElementId}
              focusNonce={props.focusNonce}
              aiConnected={false}
              aiBusy={props.aiBusy}
              onSelect={props.onSelect}
              onApplyFix={props.onApplyFix}
            />
          </div>
        )}
      </div>
    </aside>
  );
}
