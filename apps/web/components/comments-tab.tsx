"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, ChevronDown, ChevronRight, MessageSquarePlus, MessagesSquare } from "lucide-react";
import {
  addComment,
  createThread,
  deleteComment,
  editComment,
  listMentionableUsers,
  listThreads,
  reopenThread,
  resolveThread,
  type MentionableUser,
  type ThreadView,
} from "@/lib/comment-actions";
import { Avatar } from "@/components/settings/settings-ui";
import { CommentComposer } from "@/components/comment-composer";
import { CommentThreadView, ThreadStatusBadge, relativeTime } from "@/components/comment-thread-view";
import { cn } from "@/lib/utils";

interface CommentsTabProps {
  diagramId: string;
  currentUserId: string;
  canComment: boolean;
  canResolveAny: boolean;
  selectedElement: { id: string; name: string } | null;
  liveElementIds: string[];
  /** Map of element id -> label, sourced from the canvas registry (for thread chips). */
  elementNames?: Record<string, string>;
  /**
   * Right-click "Comment" signal from the canvas. When its nonce changes to a new
   * non-null value, open a new-comment composer anchored to {id,name} — explicitly,
   * not via the bpmn-js selection (the right-clicked element may differ).
   */
  composeRequest?: { id: string; name: string; nonce: number } | null;
  initialThreadId?: string;
  onFocusElement: (elementId: string) => void;
  onCommentedElementsChange: (ids: string[]) => void;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

export function CommentsTab({
  diagramId,
  currentUserId,
  canComment,
  canResolveAny,
  selectedElement,
  liveElementIds,
  elementNames,
  composeRequest,
  initialThreadId,
  onFocusElement,
  onCommentedElementsChange,
}: CommentsTabProps) {
  const [threads, setThreads] = useState<ThreadView[]>([]);
  const [candidates, setCandidates] = useState<MentionableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  // Explicit composer anchor set by a right-click "Comment" request. When non-null
  // it overrides the bpmn-js selection as the new thread's anchor.
  const [composeAnchor, setComposeAnchor] = useState<{ id: string; name: string } | null>(null);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const lastComposeNonce = useRef<number | null>(null);

  const liveSet = useMemo(() => new Set(liveElementIds), [liveElementIds]);
  const appliedInitial = useRef(false);
  // Loop guards for the select-element <-> open-thread <-> focus-element cycle.
  const lastSelectedElementIdRef = useRef<string | null>(null);
  const lastFocusedThreadIdRef = useRef<string | null>(null);

  const onFocusRef = useRef(onFocusElement);
  onFocusRef.current = onFocusElement;

  const onCommentedRef = useRef(onCommentedElementsChange);
  onCommentedRef.current = onCommentedElementsChange;

  const refetch = useCallback(async () => {
    const [t, c] = await Promise.all([listThreads(diagramId), listMentionableUsers(diagramId)]);
    setThreads(t);
    setCandidates(c);
    // Report element ids with at least one OPEN thread (deduped) to the canvas.
    const ids = new Set<string>();
    for (const th of t) {
      if (th.status === "open" && th.elementId) ids.add(th.elementId);
    }
    onCommentedRef.current([...ids]);
    return t;
  }, [diagramId]);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refetch()
      .then((t) => {
        if (cancelled) return;
        if (!appliedInitial.current && initialThreadId && t.some((x) => x.id === initialThreadId)) {
          appliedInitial.current = true;
          setOpenThreadId(initialThreadId);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagramId]);

  // Right-click "Comment": open a composer anchored to the requested element.
  // Keyed on the nonce so it fires once per genuine request (and re-fires when
  // the same element is re-requested). Closes any open thread and overrides the
  // selection-based anchor with the explicit {id,name} from the request.
  useEffect(() => {
    if (!composeRequest) return;
    if (lastComposeNonce.current === composeRequest.nonce) return;
    lastComposeNonce.current = composeRequest.nonce;
    setComposeAnchor({ id: composeRequest.id, name: composeRequest.name });
    setOpenThreadId(null);
    setComposing(true);
  }, [composeRequest]);

  // (2) Selecting an element on the canvas opens its most-recent OPEN thread.
  // Acts only on genuine selection changes (guarded by lastSelectedElementIdRef)
  // and never while composing a new comment. If no open thread exists for the
  // element, the current view is left unchanged. setOpenThreadId is idempotent:
  // when #3 re-focuses the same element, this finds the same already-open thread
  // and the state doesn't change → no further cascade.
  useEffect(() => {
    const id = selectedElement?.id ?? null;
    if (id === lastSelectedElementIdRef.current) return;
    lastSelectedElementIdRef.current = id;
    if (!id || composing) return;
    const match = threads
      .filter((t) => t.status === "open" && t.elementId === id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (match) setOpenThreadId(match.id);
  }, [selectedElement?.id, composing, threads]);

  // (3) Opening an element-anchored thread outlines its element on the canvas.
  // Keyed on openThreadId; only fires when the open thread genuinely changes
  // (lastFocusedThreadIdRef). Diagram-level threads (elementId === null) never
  // focus. Because focusing re-selects the same element that opened the thread,
  // effect #2 finds the same thread and leaves openThreadId unchanged → no loop.
  useEffect(() => {
    if (openThreadId === lastFocusedThreadIdRef.current) return;
    lastFocusedThreadIdRef.current = openThreadId;
    if (!openThreadId) return;
    const t = threads.find((x) => x.id === openThreadId);
    if (t?.elementId) onFocusRef.current(t.elementId);
  }, [openThreadId, threads]);

  /** Run a mutation, then refetch; surface errors inline. */
  const mutate = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await action();
        await refetch();
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [refetch],
  );

  const groups = useMemo(() => {
    const open: ThreadView[] = [];
    const unanchored: ThreadView[] = [];
    const resolved: ThreadView[] = [];
    for (const t of threads) {
      if (t.status === "resolved") {
        resolved.push(t);
      } else if (t.elementId && !liveSet.has(t.elementId)) {
        unanchored.push(t);
      } else {
        open.push(t);
      }
    }
    return { open, unanchored, resolved };
  }, [threads, liveSet]);

  const openThread = openThreadId
    ? threads.find((t) => t.id === openThreadId) ?? null
    : null;

  // ----- Thread detail view -----
  if (openThread) {
    const canResolve = canResolveAny || openThread.createdBy === currentUserId;
    return (
      <div className="flex h-full flex-col">
        {error && <ErrorLine message={error} />}
        <div className="min-h-0 flex-1">
          <CommentThreadView
            thread={openThread}
            candidates={candidates}
            currentUserId={currentUserId}
            canResolve={canResolve}
            busy={busy}
            onBack={() => setOpenThreadId(null)}
            onReply={(body, ids) =>
              mutate(() => addComment({ threadId: openThread.id, body, mentionedUserIds: ids }))
            }
            onResolveToggle={() =>
              mutate(() =>
                openThread.status === "resolved"
                  ? reopenThread(openThread.id)
                  : resolveThread(openThread.id),
              )
            }
            onEditComment={(commentId, body, ids) =>
              mutate(() => editComment({ commentId, body, mentionedUserIds: ids }))
            }
            onDeleteComment={(commentId) => mutate(() => deleteComment(commentId))}
            onFocusElement={onFocusElement}
          />
        </div>
      </div>
    );
  }

  // ----- List view -----
  // A right-click "Comment" anchor (composeAnchor) takes precedence over the
  // bpmn-js selection; otherwise fall back to the current selection / general.
  const activeAnchor = composeAnchor ?? selectedElement;
  const anchorLabel = activeAnchor
    ? `Commenting on «${activeAnchor.name || "element"}»`
    : "General (whole diagram)";

  const isEmpty =
    !loading &&
    groups.open.length === 0 &&
    groups.unanchored.length === 0 &&
    groups.resolved.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-hairline px-3 py-2.5">
        <span className="text-sm font-medium text-fg">Comments</span>
        {canComment && !composing && (
          <button
            type="button"
            onClick={() => {
              // Manual "New comment" uses the live selection, not a stale
              // right-click anchor.
              setComposeAnchor(null);
              setComposing(true);
            }}
            className="flex items-center gap-1 rounded-[6px] border border-hairline px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-elevated hover:text-accent"
          >
            <MessageSquarePlus className="size-3.5" />
            New comment
          </button>
        )}
      </div>

      {error && <ErrorLine message={error} />}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {canComment && composing && (
          <div className="rounded-[10px] border border-hairline bg-elevated/40 p-2.5">
            <CommentComposer
              candidates={candidates}
              anchorLabel={anchorLabel}
              submitting={busy}
              autoFocus
              onSubmit={(body, ids) =>
                mutate(async () => {
                  await createThread({
                    diagramId,
                    elementId: activeAnchor?.id ?? null,
                    body,
                    mentionedUserIds: ids,
                  });
                  setComposing(false);
                  setComposeAnchor(null);
                })
              }
              onCancel={() => {
                setComposing(false);
                setComposeAnchor(null);
              }}
            />
          </div>
        )}

        {loading && <p className="px-2 py-6 text-center text-sm text-fg-subtle">Loading comments…</p>}

        {isEmpty && !composing && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <MessagesSquare className="size-6 text-fg-subtle" />
            <p className="text-sm text-fg-muted">No comments yet.</p>
            <p className="text-xs text-fg-subtle">
              Select an element or start a general thread to discuss this diagram.
            </p>
          </div>
        )}

        {groups.open.length > 0 && (
          <Section title="Open">
            {groups.open.map((t) => (
              <ThreadRow
                key={t.id}
                thread={t}
                selectedElement={selectedElement}
                elementNames={elementNames}
                onOpen={() => setOpenThreadId(t.id)}
              />
            ))}
          </Section>
        )}

        {groups.unanchored.length > 0 && (
          <Section title="Unanchored" hint="The element these threads point to was removed.">
            {groups.unanchored.map((t) => (
              <ThreadRow
                key={t.id}
                thread={t}
                selectedElement={selectedElement}
                elementNames={elementNames}
                unanchored
                onOpen={() => setOpenThreadId(t.id)}
              />
            ))}
          </Section>
        )}

        {groups.resolved.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowResolved((v) => !v)}
              className="mb-1.5 flex items-center gap-1 px-0.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle transition-colors hover:text-fg-muted"
            >
              {showResolved ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
              Resolved ({groups.resolved.length})
            </button>
            {showResolved && (
              <div className="space-y-2">
                {groups.resolved.map((t) => (
                  <ThreadRow
                    key={t.id}
                    thread={t}
                    selectedElement={selectedElement}
                    elementNames={elementNames}
                    secondary
                    onOpen={() => setOpenThreadId(t.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <p className="border-b border-error/20 bg-error/5 px-3 py-1.5 text-xs text-error" role="alert">
      {message}
    </p>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 px-0.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
        {title}
      </p>
      {hint && <p className="mb-1.5 px-0.5 text-[11px] text-fg-subtle">{hint}</p>}
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ThreadRow({
  thread,
  selectedElement,
  elementNames,
  secondary,
  unanchored,
  onOpen,
}: {
  thread: ThreadView;
  selectedElement: { id: string; name: string } | null;
  elementNames?: Record<string, string>;
  secondary?: boolean;
  unanchored?: boolean;
  onOpen: () => void;
}) {
  const first = thread.comments[0];
  const last = thread.comments[thread.comments.length - 1];
  const replies = Math.max(0, thread.comments.length - 1);

  // Prefer the live canvas label for the anchored element; fall back to the
  // selected element's name when it matches, else a generic chip.
  const elementLabel =
    (thread.elementId && elementNames?.[thread.elementId]) ||
    (thread.elementId && selectedElement && selectedElement.id === thread.elementId
      ? selectedElement.name
      : "") ||
    "Element";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full flex-col gap-1.5 rounded-[10px] border border-hairline p-2.5 text-left transition-colors hover:border-accent/40 hover:bg-elevated/50",
        secondary ? "bg-panel/40 opacity-80" : "bg-elevated/40",
      )}
    >
      <div className="flex items-center gap-2">
        <ThreadStatusBadge status={thread.status} />
        {thread.elementId ? (
          <span
            className={cn(
              "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]",
              unanchored
                ? "border-warning/30 bg-warning/10 text-warning"
                : "border-hairline text-fg-muted",
            )}
          >
            <Box className="size-2.5" />
            {unanchored ? "element removed" : elementLabel}
          </span>
        ) : (
          <span className="rounded-full border border-hairline px-1.5 py-0.5 text-[10px] text-fg-muted">
            General
          </span>
        )}
        <span className="ml-auto text-[10px] text-fg-subtle">
          {relativeTime(thread.updatedAt)}
        </span>
      </div>

      {first && (
        <div className="flex items-start gap-2">
          <Avatar name={first.author.name} className="size-5 text-[9px]" />
          <div className="min-w-0">
            <span className="text-[11px] font-medium text-fg-muted">{first.author.name}</span>
            <p className="line-clamp-2 break-words text-[13px] leading-snug text-fg">
              {(last ?? first).body}
            </p>
          </div>
        </div>
      )}

      {replies > 0 && (
        <span className="text-[10px] text-fg-subtle">
          {replies} {replies === 1 ? "reply" : "replies"}
        </span>
      )}
    </button>
  );
}
