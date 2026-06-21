"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import type { MentionableUser } from "@/lib/comment-actions";
import { parseMentions } from "@/lib/mentions";
import { Avatar } from "@/components/settings/settings-ui";
import { cn } from "@/lib/utils";

interface CommentComposerProps {
  candidates: MentionableUser[];
  anchorLabel?: string;
  submitting?: boolean;
  autoFocus?: boolean;
  initialBody?: string;
  placeholder?: string;
  submitLabel?: string;
  onSubmit: (body: string, mentionedUserIds: string[]) => void;
  onCancel?: () => void;
}

/** State of the `@`-autocomplete popup, derived from the caret position. */
interface MentionQuery {
  /** Index of the `@` that started the active token. */
  at: number;
  /** The typed prefix after `@` (lowercased for matching). */
  prefix: string;
}

/**
 * Inspect `value` at `caret` and return the active `@mention` token, if any.
 * A token is active when an unbroken run of `@` + word/space chars precedes the
 * caret and the `@` itself sits at the start of the string or after whitespace.
 */
function activeMention(value: string, caret: number): MentionQuery | null {
  let i = caret - 1;
  // Walk back over the partial name (letters/digits/spaces) to find the `@`.
  while (i >= 0) {
    const ch = value[i];
    if (ch === "@") {
      const before = value[i - 1];
      if (before === undefined || /\s/.test(before)) {
        return { at: i, prefix: value.slice(i + 1, caret).toLowerCase() };
      }
      return null;
    }
    // Names can contain spaces; stop at a newline or a second `@`.
    if (ch === "\n") return null;
    i--;
  }
  return null;
}

export function CommentComposer({
  candidates,
  anchorLabel,
  submitting,
  autoFocus,
  initialBody,
  placeholder = "Write a comment…  use @ to mention",
  submitLabel,
  onSubmit,
  onCancel,
}: CommentComposerProps) {
  const [body, setBody] = useState(initialBody ?? "");
  const [query, setQuery] = useState<MentionQuery | null>(null);
  const [active, setActive] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 192)}px`;
  };

  useEffect(() => {
    resize();
    if (autoFocus) {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const matches = useMemo(() => {
    if (!query) return [];
    const p = query.prefix;
    return candidates
      .filter((c) => c.name.toLowerCase().includes(p))
      .slice(0, 6);
  }, [query, candidates]);

  const popupOpen = query !== null && matches.length > 0;

  const syncQuery = () => {
    const el = textareaRef.current;
    if (!el) return;
    const next = activeMention(el.value, el.selectionStart ?? el.value.length);
    setQuery(next);
    setActive(0);
  };

  const insertMention = (user: MentionableUser) => {
    if (!query) return;
    const el = textareaRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? body.length;
    const before = body.slice(0, query.at);
    const after = body.slice(caret);
    const inserted = `@${user.name} `;
    const next = before + inserted + after;
    setBody(next);
    setQuery(null);
    setActive(0);
    requestAnimationFrame(() => {
      const pos = (before + inserted).length;
      el.focus();
      el.setSelectionRange(pos, pos);
      resize();
    });
  };

  const doSubmit = () => {
    const t = body.trim();
    if (!t || submitting) return;
    const mentionedUserIds = parseMentions(t, candidates);
    onSubmit(t, mentionedUserIds);
    setBody("");
    setQuery(null);
    requestAnimationFrame(resize);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (popupOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => (a + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => (a - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(matches[active]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setQuery(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSubmit();
      return;
    }
    if (e.key === "Escape" && onCancel) {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="space-y-1.5">
      {anchorLabel && (
        <p className="px-0.5 text-[11px] font-medium text-fg-muted">{anchorLabel}</p>
      )}
      <div className="relative">
        {popupOpen && (
          <ul
            role="listbox"
            className="absolute bottom-full z-20 mb-1 max-h-52 w-full overflow-y-auto rounded-[8px] border border-hairline bg-panel/95 p-1 backdrop-blur"
          >
            {matches.map((u, i) => (
              <li key={u.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(u);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-sm transition-colors",
                    i === active ? "bg-accent/15 text-accent" : "text-fg-muted hover:bg-elevated",
                  )}
                >
                  <Avatar name={u.name} className="size-5 text-[9px]" />
                  <span className="truncate">{u.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="relative rounded-[10px] border border-hairline bg-canvas transition-colors focus-within:border-accent">
          <textarea
            ref={textareaRef}
            value={body}
            rows={2}
            disabled={submitting}
            onChange={(e) => {
              setBody(e.target.value);
              resize();
              syncQuery();
            }}
            onKeyUp={syncQuery}
            onClick={syncQuery}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="block min-h-[60px] max-h-48 w-full resize-none rounded-[10px] bg-transparent py-2.5 pl-3 pr-11 text-sm leading-relaxed placeholder:text-fg-subtle focus:outline-none disabled:opacity-60"
          />
          <button
            type="button"
            onClick={doSubmit}
            disabled={submitting || body.trim().length === 0}
            title={submitLabel ?? "Send"}
            aria-label={submitLabel ?? "Send"}
            className="absolute bottom-1.5 right-1.5 flex size-7 items-center justify-center rounded-[8px] bg-accent text-white transition-colors hover:bg-accent/90 disabled:opacity-30 disabled:hover:bg-accent"
          >
            <Send className="size-3.5" />
          </button>
        </div>
      </div>
      {onCancel && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[11px] text-fg-subtle transition-colors hover:text-fg-muted"
          >
            <X className="size-3" />
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
