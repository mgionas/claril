"use client";

import { Fragment, useState } from "react";
import { ArrowLeft, Check, MoreHorizontal, Pencil, Trash2, RotateCcw, Box } from "lucide-react";
import type { CommentView, MentionableUser, ThreadView } from "@/lib/comment-actions";
import { Avatar } from "@/components/settings/settings-ui";
import { CommentComposer } from "@/components/comment-composer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface CommentThreadViewProps {
  thread: ThreadView;
  candidates: MentionableUser[];
  currentUserId: string;
  canResolve: boolean;
  busy?: boolean;
  onBack: () => void;
  onReply: (body: string, mentionedUserIds: string[]) => void;
  onResolveToggle: () => void;
  onEditComment: (commentId: string, body: string, mentionedUserIds: string[]) => void;
  onDeleteComment: (commentId: string) => void;
  onFocusElement?: (elementId: string) => void;
}

/** Compact relative-time formatter ("just now", "5m", "3h", "2d", or a date). */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Render `body` with `@Name` tokens highlighted. Splits on the candidate names
 * (longest first so multi-word names win); a matched `@Name` becomes an accent
 * span. Plain-text only — no markdown.
 */
function HighlightedBody({ body, candidates }: { body: string; candidates: MentionableUser[] }) {
  const names = [...candidates]
    .map((c) => c.name)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (names.length === 0) return <>{body}</>;

  const lower = body.toLowerCase();
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let buf = "";
  const flush = () => {
    if (buf) {
      nodes.push(<Fragment key={`t${nodes.length}`}>{buf}</Fragment>);
      buf = "";
    }
  };

  while (i < body.length) {
    if (body[i] === "@" && (i === 0 || /\s/.test(body[i - 1]))) {
      const match = names.find((n) => lower.startsWith(n.toLowerCase(), i + 1));
      if (match) {
        const end = i + 1 + match.length;
        const after = body[end];
        if (after === undefined || !/[A-Za-z0-9]/.test(after)) {
          flush();
          nodes.push(
            <span key={`m${nodes.length}`} className="font-medium text-accent">
              @{match}
            </span>,
          );
          i = end;
          continue;
        }
      }
    }
    buf += body[i];
    i++;
  }
  flush();
  return <>{nodes}</>;
}

function CommentRow({
  comment,
  candidates,
  isOwn,
  busy,
  onEdit,
  onDelete,
}: {
  comment: CommentView;
  candidates: MentionableUser[];
  isOwn: boolean;
  busy?: boolean;
  onEdit: (body: string, mentionedUserIds: string[]) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex gap-2.5">
      <Avatar name={comment.author.name} className="size-7 text-[10px]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-fg">{comment.author.name}</span>
          <span className="shrink-0 text-[11px] text-fg-subtle">{relativeTime(comment.createdAt)}</span>
          {comment.editedAt && (
            <span className="shrink-0 text-[11px] text-fg-subtle" title="Edited">
              (edited)
            </span>
          )}
          {isOwn && !editing && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="ml-auto flex size-6 items-center justify-center rounded-[6px] text-fg-subtle transition-colors hover:bg-elevated hover:text-fg-muted"
                  aria-label="Comment actions"
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <Pencil className="size-3.5" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={(e) => {
                    e.preventDefault();
                    setConfirmDelete(true);
                  }}
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {editing ? (
          <div className="mt-1.5">
            <CommentComposer
              candidates={candidates}
              submitting={busy}
              autoFocus
              initialBody={comment.body}
              submitLabel="Save"
              placeholder="Edit comment…"
              onSubmit={(body, ids) => {
                onEdit(body, ids);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-fg">
            <HighlightedBody body={comment.body} candidates={candidates} />
          </p>
        )}

        {confirmDelete && !editing && (
          <div className="mt-1.5 flex items-center gap-2 rounded-[8px] border border-error/30 bg-error/10 px-2.5 py-1.5 text-[11px]">
            <span className="text-error">Delete this comment?</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onDelete();
                setConfirmDelete(false);
              }}
              className="ml-auto rounded-[5px] bg-error px-2 py-0.5 font-medium text-white transition-colors hover:bg-error/90 disabled:opacity-40"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-[5px] px-2 py-0.5 text-fg-muted transition-colors hover:bg-elevated"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function CommentThreadView({
  thread,
  candidates,
  currentUserId,
  canResolve,
  busy,
  onBack,
  onReply,
  onResolveToggle,
  onEditComment,
  onDeleteComment,
  onFocusElement,
}: CommentThreadViewProps) {
  const resolved = thread.status === "resolved";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-hairline px-3 py-2.5">
        <button
          type="button"
          onClick={onBack}
          className="flex size-7 items-center justify-center rounded-[6px] text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
          aria-label="Back to all comments"
        >
          <ArrowLeft className="size-4" />
        </button>
        {thread.elementId ? (
          <button
            type="button"
            onClick={() => onFocusElement?.(thread.elementId!)}
            className="flex items-center gap-1.5 rounded-full border border-hairline px-2 py-0.5 text-[11px] text-fg-muted transition-colors hover:bg-elevated hover:text-accent"
            title="Focus element on canvas"
          >
            <Box className="size-3" />
            Element
          </button>
        ) : (
          <span className="flex items-center gap-1.5 rounded-full border border-hairline px-2 py-0.5 text-[11px] text-fg-muted">
            General
          </span>
        )}
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
            resolved
              ? "bg-success/10 text-success"
              : "bg-accent/10 text-accent",
          )}
        >
          {resolved ? "Resolved" : "Open"}
        </span>
        {canResolve && (
          <button
            type="button"
            onClick={onResolveToggle}
            disabled={busy}
            className="ml-auto flex items-center gap-1 rounded-[6px] border border-hairline px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-elevated hover:text-fg disabled:opacity-40"
          >
            {resolved ? <RotateCcw className="size-3" /> : <Check className="size-3" />}
            {resolved ? "Reopen" : "Resolve"}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {thread.comments.map((c) => (
          <CommentRow
            key={c.id}
            comment={c}
            candidates={candidates}
            isOwn={c.author.id === currentUserId}
            busy={busy}
            onEdit={(body, ids) => onEditComment(c.id, body, ids)}
            onDelete={() => onDeleteComment(c.id)}
          />
        ))}
      </div>

      <div className="border-t border-hairline p-3">
        <CommentComposer
          candidates={candidates}
          submitting={busy}
          placeholder="Reply…  use @ to mention"
          onSubmit={onReply}
        />
      </div>
    </div>
  );
}
