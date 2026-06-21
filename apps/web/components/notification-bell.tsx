"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Building2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import {
  getUnreadCount,
  listNotifications,
  markNotificationsRead,
  type NotificationView,
} from "@/lib/notification-actions";
import { listMyInvitations, type InvitationView } from "@/lib/invitation-actions";
import { Avatar } from "@/components/settings/settings-ui";
import { relativeTime } from "@/components/comment-thread-view";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const VERB: Record<NotificationView["type"], string> = {
  mention: "mentioned you",
  reply: "replied",
  resolved: "resolved a thread",
};

/**
 * Top-bar notification bell. Shows the current user's unread comment
 * notifications AND pending organization invitations (so any user — including a
 * brand-new personal account with no org — can accept an invite in-app, since
 * we send no invite emails). Mounted for every signed-in user. All server-action
 * failures are swallowed so the bell never crashes the shell.
 */
export function NotificationBell() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const [invitations, setInvitations] = useState<InvitationView[]>([]);
  const [items, setItems] = useState<NotificationView[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const badge = unread + invitations.length;

  const refetch = useCallback(async () => {
    try {
      const [count, invites] = await Promise.all([getUnreadCount(), listMyInvitations()]);
      setUnread(count);
      setInvitations(invites);
    } catch {
      // Quietly ignore — a transient failure must not break the header.
    }
  }, []);

  // Initial fetch + refresh on navigation (new mentions/invites may have arrived).
  useEffect(() => {
    void refetch();
  }, [refetch, pathname]);

  const handleOpen = useCallback(
    async (open: boolean) => {
      if (!open) return;
      setLoading(true);
      try {
        const [list, invites] = await Promise.all([listNotifications(), listMyInvitations()]);
        setItems(list);
        setInvitations(invites);
        const unreadIds = list.filter((n) => n.readAt == null).map((n) => n.id);
        if (unreadIds.length > 0) {
          setUnread(0); // optimistic; invitations stay in the badge until acted on
          try {
            await markNotificationsRead(unreadIds);
          } catch {
            void refetch();
          }
        }
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [refetch],
  );

  const acceptInvite = useCallback(async (inv: InvitationView) => {
    setBusyId(inv.id);
    try {
      const { error } = await authClient.organization.acceptInvitation({ invitationId: inv.id });
      if (error) {
        setBusyId(null);
        return;
      }
      // Switch into the org, then hard-reload so all server components re-read it.
      await authClient.organization.setActive({ organizationId: inv.organizationId });
      window.location.assign("/");
    } catch {
      setBusyId(null);
    }
  }, []);

  const declineInvite = useCallback(
    async (inv: InvitationView) => {
      setBusyId(inv.id);
      try {
        await authClient.organization.rejectInvitation({ invitationId: inv.id });
      } catch {
        /* ignore */
      } finally {
        setBusyId(null);
        void refetch();
      }
    },
    [refetch],
  );

  return (
    <DropdownMenu onOpenChange={(open) => void handleOpen(open)}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative"
          aria-label={badge > 0 ? `Notifications (${badge} new)` : "Notifications"}
        >
          <Bell className="size-4" />
          {badge > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-white"
              aria-hidden
            >
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="border-b border-hairline px-3 py-2 text-sm font-medium text-fg">
          Notifications
        </div>
        <div className="max-h-96 overflow-y-auto py-1">
          {/* Pending org invitations — actionable, shown first. */}
          {invitations.map((inv) => (
            <div key={inv.id} className="flex items-start gap-2.5 px-3 py-2.5">
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-hairline bg-elevated text-fg-muted">
                <Building2 className="size-3.5" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-sm leading-snug text-fg">
                  <span className="font-medium">{inv.inviterName}</span> invited you to{" "}
                  <span className="font-medium">{inv.organizationName}</span>
                  {inv.role ? ` as ${inv.role}` : ""}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    disabled={busyId === inv.id}
                    onClick={() => void acceptInvite(inv)}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-xs"
                    disabled={busyId === inv.id}
                    onClick={() => void declineInvite(inv)}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {invitations.length > 0 && (items?.length ?? 0) > 0 && (
            <div className="my-1 h-px bg-hairline" />
          )}

          {loading && items == null ? (
            <p className="px-3 py-6 text-center text-sm text-fg-subtle">Loading…</p>
          ) : items && items.length > 0 ? (
            items.map((n) => (
              <Link
                key={n.id}
                href={n.threadId ? `/d/${n.diagramId}?thread=${n.threadId}` : `/d/${n.diagramId}`}
                className="flex items-start gap-2.5 px-3 py-2 outline-none transition-colors hover:bg-elevated focus-visible:bg-elevated"
              >
                <Avatar name={n.actor.name} className="mt-0.5 size-7" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm leading-snug text-fg">
                    <span className="font-medium">{n.actor.name}</span> {VERB[n.type]}
                    {" on "}
                    <span className="font-medium">{n.diagramName}</span>
                  </span>
                  <span className="text-[11px] text-fg-subtle">{relativeTime(n.createdAt)}</span>
                </span>
                {n.readAt == null && (
                  <span
                    className="mt-1.5 size-2 shrink-0 rounded-full bg-accent"
                    aria-label="Unread"
                  />
                )}
              </Link>
            ))
          ) : invitations.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-fg-subtle">No notifications yet.</p>
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
