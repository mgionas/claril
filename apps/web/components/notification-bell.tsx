"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import {
  getUnreadCount,
  listNotifications,
  markNotificationsRead,
  type NotificationView,
} from "@/lib/notification-actions";
import { Avatar } from "@/components/settings/settings-ui";
import { relativeTime } from "@/components/comment-thread-view";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const VERB: Record<NotificationView["type"], string> = {
  mention: "mentioned you",
  reply: "replied",
  resolved: "resolved a thread",
};

/**
 * Top-bar notification bell (W16). Shows the current user's unread count and,
 * on open, lists recent notifications with deep links to the originating
 * thread. Opening the menu marks the shown unread items read and clears the
 * badge. All server-action failures are swallowed so the bell never crashes
 * the shell. Mounted only in org scope (see `app-shell.tsx`).
 */
export function NotificationBell() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationView[] | null>(null);
  const [loading, setLoading] = useState(false);

  const refetchCount = useCallback(async () => {
    try {
      setUnread(await getUnreadCount());
    } catch {
      // Quietly ignore — a transient failure must not break the header.
    }
  }, []);

  // Initial count + refresh whenever the route changes (new mentions may have
  // arrived while the user navigated).
  useEffect(() => {
    void refetchCount();
  }, [refetchCount, pathname]);

  const handleOpen = useCallback(
    async (open: boolean) => {
      if (!open) return;
      setLoading(true);
      try {
        const list = await listNotifications();
        setItems(list);
        const unreadIds = list.filter((n) => n.readAt == null).map((n) => n.id);
        if (unreadIds.length > 0) {
          // Optimistically clear the badge, then persist.
          setUnread(0);
          try {
            await markNotificationsRead(unreadIds);
          } catch {
            // Restore the count if persistence failed.
            void refetchCount();
          }
        }
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [refetchCount],
  );

  return (
    <DropdownMenu onOpenChange={(open) => void handleOpen(open)}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative"
          aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
        >
          <Bell className="size-4" />
          {unread > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-white"
              aria-hidden
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="border-b border-hairline px-3 py-2 text-sm font-medium text-fg">
          Notifications
        </div>
        <div className="max-h-96 overflow-y-auto py-1">
          {loading && items == null ? (
            <p className="px-3 py-6 text-center text-sm text-fg-subtle">Loading…</p>
          ) : items && items.length > 0 ? (
            items.map((n) => (
              <Link
                key={n.id}
                href={
                  n.threadId
                    ? `/d/${n.diagramId}?thread=${n.threadId}`
                    : `/d/${n.diagramId}`
                }
                className="flex items-start gap-2.5 px-3 py-2 outline-none transition-colors hover:bg-elevated focus-visible:bg-elevated"
              >
                <Avatar name={n.actor.name} className="mt-0.5 size-7" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm leading-snug text-fg">
                    <span className="font-medium">{n.actor.name}</span>{" "}
                    {VERB[n.type]}
                    {" on "}
                    <span className="font-medium">{n.diagramName}</span>
                  </span>
                  <span className="text-[11px] text-fg-subtle">
                    {relativeTime(n.createdAt)}
                  </span>
                </span>
                {n.readAt == null && (
                  <span
                    className="mt-1.5 size-2 shrink-0 rounded-full bg-accent"
                    aria-label="Unread"
                  />
                )}
              </Link>
            ))
          ) : (
            <p className={cn("px-3 py-6 text-center text-sm text-fg-subtle")}>
              No notifications yet.
            </p>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
