"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Send, Wand2, FileText, Trash2 } from "lucide-react";
import type { Finding } from "@claril/shared";
import type { ProcessGraph } from "@claril/logic-inspector";
import type { EditPlan } from "@claril/ai-advisor";
import { ChatBubble } from "@/components/chat-bubble";
import { ProposalCard } from "@/components/proposal-card";
import { appendChatMessages, clearChat } from "@/lib/chat-actions";

export interface ChatTabHandle {
  /** Inject a message into the transcript (used by "Ask AI" from Problems). */
  ask: (text: string) => void;
  /** Focus the composer textarea (used by "Keep refining"). */
  focusComposer: () => void;
}

interface ChatContext {
  graph: ProcessGraph | null;
  findings: Finding[];
  diagramId: string;
}

interface ChatTabProps {
  handleRef: Ref<ChatTabHandle>;
  getContext: () => ChatContext;
  initialMessages?: { id: string; role: string; parts: unknown }[];
  /** Live-apply a proposed plan to the canvas. */
  onProposal: (plan: EditPlan, toolCallId: string) => void;
  pendingProposalId: string | null;
  onApplyPlan: () => void;
  onDiscardPlan: () => void;
  onKeepRefining: () => void;
  onGenerateDocs: () => void;
  onReview: () => void;
}

export function ChatTab(props: ChatTabProps) {
  const [input, setInput] = useState("");
  const [sessionTokens, setSessionTokens] = useState(0);
  const seenProposals = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the composer from one line up to a cap, then scroll internally.
  const resizeComposer = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 192)}px`;
  };

  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: "/api/ai/chat" }),
    messages: (props.initialMessages as never) ?? undefined,
  });

  const persistedIds = useRef<Set<string>>(new Set());
  // Seed with hydrated ids so we never re-insert them, and seed seenProposals
  // with hydrated proposeEdit tool calls so they aren't re-applied on reload.
  useEffect(() => {
    for (const m of props.initialMessages ?? []) {
      persistedIds.current.add(m.id);
      const parts = (m.parts ?? []) as Array<{ type?: string; toolCallId?: string }>;
      for (const part of parts) {
        if (part.type === "tool-proposeEdit" && part.toolCallId) {
          seenProposals.current.add(part.toolCallId);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist each finished turn (messages whose id we haven't stored yet).
  useEffect(() => {
    if (status !== "ready") return;
    const fresh = messages.filter((m) => !persistedIds.current.has(m.id));
    if (fresh.length === 0) return;
    for (const m of fresh) persistedIds.current.add(m.id);
    void appendChatMessages(
      props.getContext().diagramId,
      fresh.map((m) => ({ id: m.id, role: m.role, parts: m.parts })),
    ).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, messages]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const ctx = props.getContext();
    void sendMessage(
      { text: t },
      { body: { graph: ctx.graph, findings: ctx.findings, diagramId: ctx.diagramId } },
    );
  };

  const submit = () => {
    const t = input.trim();
    if (!t || busy) return;
    send(t);
    setInput("");
    requestAnimationFrame(resizeComposer);
  };

  useImperativeHandle(props.handleRef, () => ({
    ask: (text) => send(text),
    focusComposer: () => {
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
      });
    },
  }));

  // Live-apply each new proposeEdit tool output exactly once.
  useEffect(() => {
    for (const m of messages) {
      for (const part of m.parts) {
        if (
          part.type === "tool-proposeEdit" &&
          part.state === "output-available" &&
          !seenProposals.current.has(part.toolCallId)
        ) {
          seenProposals.current.add(part.toolCallId);
          props.onProposal(part.output as EditPlan, part.toolCallId);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // Accumulate session token usage from finish metadata.
  useEffect(() => {
    let total = 0;
    for (const m of messages) {
      const u = (m.metadata as { usage?: { input?: number; output?: number } } | undefined)?.usage;
      if (u) total += (u.input ?? 0) + (u.output ?? 0);
    }
    setSessionTokens(total);
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, status]);

  const busy = status === "submitted" || status === "streaming";

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-fg-subtle">
            Ask about this process, or describe a change to apply.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="space-y-2">
            {m.parts.map((part, i) => {
              if (part.type === "text") {
                return m.role === "user" ? (
                  <ChatBubble key={i} role="user">
                    {part.text}
                  </ChatBubble>
                ) : (
                  <ChatBubble key={i} role="assistant" markdown={part.text} />
                );
              }
              if (part.type === "tool-proposeEdit") {
                if (part.state === "output-available") {
                  return (
                    <ProposalCard
                      key={i}
                      plan={part.output as EditPlan}
                      pending={part.toolCallId === props.pendingProposalId}
                      busy={busy}
                      onApply={props.onApplyPlan}
                      onDiscard={props.onDiscardPlan}
                      onKeepRefining={props.onKeepRefining}
                    />
                  );
                }
                return <PhasePill key={i} label="Drawing changes…" />;
              }
              return null;
            })}
          </div>
        ))}
        {status === "submitted" && <PhasePill label="Analyzing…" />}
        {status === "error" && (
          <p className="px-2 text-xs text-error">The AI request failed. Try again.</p>
        )}
      </div>

      <div className="border-t border-hairline p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex flex-wrap gap-1">
            <Chip icon={Wand2} label="Review" onClick={props.onReview} />
            <Chip icon={FileText} label="Document" onClick={props.onGenerateDocs} />
            {messages.length > 0 && (
              <Chip
                icon={Trash2}
                label="Clear"
                onClick={() => {
                  setMessages([]);
                  persistedIds.current.clear();
                  void clearChat(props.getContext().diagramId).catch(() => {});
                }}
              />
            )}
          </div>
          {sessionTokens > 0 && (
            <span className="text-[10px] text-fg-subtle" title="Tokens used this session">
              {formatTokens(sessionTokens)} tokens
            </span>
          )}
        </div>
        <div className="relative rounded-[12px] border border-hairline bg-canvas transition-colors focus-within:border-accent">
          <textarea
            ref={textareaRef}
            value={input}
            rows={3}
            onChange={(e) => {
              setInput(e.target.value);
              resizeComposer();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Ask a question or describe a change…"
            className="block min-h-[84px] max-h-48 w-full resize-none rounded-[12px] bg-transparent py-2.5 pl-3 pr-11 text-sm leading-relaxed placeholder:text-fg-subtle focus:outline-none"
          />
          <button
            type="button"
            onClick={submit}
            disabled={busy || input.trim().length === 0}
            title="Send"
            className="absolute bottom-1.5 right-1.5 flex size-7 items-center justify-center rounded-[8px] bg-accent text-white transition-colors hover:bg-accent/90 disabled:opacity-30 disabled:hover:bg-accent"
          >
            <Send className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function PhasePill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-elevated/60 px-2 py-1 text-[11px] text-accent">
      <span className="size-1.5 animate-pulse rounded-full bg-accent" />
      {label}
    </span>
  );
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function Chip({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-full border border-hairline px-2 py-0.5 text-[11px] text-fg-muted transition-colors hover:bg-elevated hover:text-accent"
    >
      <Icon className="size-3" />
      {label}
    </button>
  );
}
