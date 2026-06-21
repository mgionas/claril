"use client";

import { type Ref } from "react";
import { Sparkles } from "lucide-react";
import type { Finding, QuickFix } from "@claril/shared";
import type { ProcessGraph } from "@claril/logic-inspector";
import type { EditPlan } from "@claril/ai-advisor";
import type { AiOverride } from "@/lib/ai";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ProblemsTab } from "@/components/problems-tab";
import { ChatTab, type ChatTabHandle } from "@/components/chat-tab";
import { CommentsTab } from "@/components/comments-tab";
import { cn } from "@/lib/utils";

export type DrawerTab = "chat" | "comments" | "problems";

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
  activeTab: DrawerTab;
  onTabChange: (tab: DrawerTab) => void;
  // comments wiring (org diagrams only)
  isOrg?: boolean;
  currentUserId: string;
  diagramId: string;
  selectedElement: { id: string; name: string } | null;
  liveElementIds: string[];
  elementNames?: Record<string, string>;
  /** Right-click "Comment" signal: open a composer anchored to {id,name}; nonce re-fires it. */
  composeRequest?: { id: string; name: string; nonce: number } | null;
  canResolveComments?: boolean;
  initialThreadId?: string;
  onFocusElement: (elementId: string) => void;
  onCommentedElementsChange: (ids: string[]) => void;
  getChatContext: () => {
    graph: ProcessGraph | null;
    findings: Finding[];
    diagramId: string;
    override?: AiOverride;
  };
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
  const showChat = props.aiConnected;
  const showComments = Boolean(props.isOrg);
  // Tabs are shown whenever there is more than one surface (Chat and/or Comments
  // beyond Problems). Personal + no-AI degrades to the bare Problems list.
  const tabbed = showChat || showComments;
  const tabCount = (showChat ? 1 : 0) + (showComments ? 1 : 0) + 1; // +1 = Problems

  const problemsTab = (
    <ProblemsTab
      findings={props.findings}
      focusedElementId={props.focusedElementId}
      focusNonce={props.focusNonce}
      aiConnected={props.aiConnected}
      aiBusy={props.aiBusy}
      onSelect={props.onSelect}
      onApplyFix={props.onApplyFix}
      onAskAi={props.aiConnected ? props.onAskAiAboutFinding : undefined}
    />
  );

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

        {tabbed ? (
          <Tabs
            value={props.activeTab}
            onValueChange={(v) => props.onTabChange(v as DrawerTab)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList
              className="mx-3 mt-2 grid"
              style={{ gridTemplateColumns: `repeat(${tabCount}, minmax(0, 1fr))` }}
            >
              {showChat && <TabsTrigger value="chat">Chat</TabsTrigger>}
              {showComments && <TabsTrigger value="comments">Comments</TabsTrigger>}
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
            {showChat && (
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
            )}
            {showComments && (
              <TabsContent value="comments" className="mt-2 min-h-0 flex-1">
                <CommentsTab
                  diagramId={props.diagramId}
                  currentUserId={props.currentUserId}
                  canComment
                  canResolveAny={Boolean(props.canResolveComments)}
                  selectedElement={props.selectedElement}
                  liveElementIds={props.liveElementIds}
                  elementNames={props.elementNames}
                  composeRequest={props.composeRequest}
                  initialThreadId={props.initialThreadId}
                  onFocusElement={props.onFocusElement}
                  onCommentedElementsChange={props.onCommentedElementsChange}
                />
              </TabsContent>
            )}
            <TabsContent value="problems" className="mt-2 min-h-0 flex-1 overflow-y-auto">
              {problemsTab}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">{problemsTab}</div>
        )}
      </div>
    </aside>
  );
}
