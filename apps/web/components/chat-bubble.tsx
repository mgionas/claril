"use client";

import { Streamdown } from "streamdown";
import type { Severity } from "@claril/shared";
import { ChatElementChip } from "@/components/chat-element-chip";
import { cn } from "@/lib/utils";

/** Lets the bubble turn `[name](#el-<id>)` links into interactive element chips. */
export interface ElementRefHandlers {
  /** BPMN type of an element id (drives the chip icon). */
  resolveType: (id: string) => string | undefined;
  /** Highest-severity open finding on an element, if any (drives the dot). */
  findingSeverity?: (id: string) => Severity | undefined;
  /** Select + fly to the element on the canvas. */
  onSelect: (id: string) => void;
}

const EL_HREF = /^#el-(.+)$/;

export function ChatBubble({
  role,
  children,
  markdown,
  elementRefs,
}: {
  role: "user" | "assistant";
  children?: React.ReactNode;
  markdown?: string;
  elementRefs?: ElementRefHandlers;
}) {
  const isUser = role === "user";

  // Render `[name](#el-<id>)` as an element chip; everything else as a normal link.
  const components = elementRefs
    ? {
        a: ({ href, children: linkChildren }: { href?: string; children?: React.ReactNode }) => {
          const m = href ? EL_HREF.exec(href) : null;
          if (m) {
            const id = decodeURIComponent(m[1]);
            const label = typeof linkChildren === "string" ? linkChildren : id;
            return (
              <ChatElementChip
                id={id}
                label={label}
                type={elementRefs.resolveType(id)}
                severity={elementRefs.findingSeverity?.(id)}
                onSelect={elementRefs.onSelect}
              />
            );
          }
          return (
            <a href={href} target="_blank" rel="noreferrer" className="text-accent underline">
              {linkChildren}
            </a>
          );
        },
      }
    : undefined;

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-[12px] px-3 py-2 text-sm leading-relaxed",
          isUser
            ? "rounded-br-[4px] bg-accent text-white"
            : "rounded-bl-[4px] border border-hairline bg-elevated/60 text-fg",
        )}
      >
        {markdown !== undefined ? (
          <div className="prose-claril">
            <Streamdown components={components}>{markdown}</Streamdown>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
