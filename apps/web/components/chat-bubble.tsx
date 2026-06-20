"use client";

import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";

export function ChatBubble({
  role,
  children,
  markdown,
}: {
  role: "user" | "assistant";
  children?: React.ReactNode;
  markdown?: string;
}) {
  const isUser = role === "user";
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
            <Streamdown>{markdown}</Streamdown>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
