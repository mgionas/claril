"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Trash2, UserPlus } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import type { MembersView, OrgRole } from "@/lib/org-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Avatar,
  RoleBadge,
  SettingsCard,
  SettingsHeader,
  StatusBanner,
  type Status,
} from "./settings-ui";

const ROLES: OrgRole[] = ["member", "admin", "owner"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function MembersManager({ view }: { view: MembersView }) {
  const router = useRouter();
  const { canManage, orgId, viewerRole } = view;
  // Only owners may grant the owner role; mirror the row-edit filtering.
  const inviteRoles = viewerRole === "owner" ? ROLES : ROLES.filter((r) => r !== "owner");
  const [status, setStatus] = useState<Status>(null);
  // Tracks which row-level action is in flight, keyed by a stable id.
  const [busyId, setBusyId] = useState<string | null>(null);

  // Invite form state.
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("member");
  const [inviting, setInviting] = useState(false);

  function report(result: { error?: { message?: string } | null }, ok: string) {
    if (result.error) {
      setStatus({ kind: "error", message: result.error.message ?? "Something went wrong." });
      return false;
    }
    setStatus({ kind: "success", message: ok });
    router.refresh();
    return true;
  }

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage || inviting) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      setStatus({ kind: "error", message: "Enter a valid email address." });
      return;
    }
    setInviting(true);
    setStatus(null);
    try {
      const res = await authClient.organization.inviteMember({
        email,
        role: inviteRole,
        organizationId: orgId,
      });
      if (
        report(
          res,
          `Invitation created for ${email} — it'll appear under Pending invitations.`,
        )
      )
        setInviteEmail("");
    } catch {
      setStatus({ kind: "error", message: "Could not send the invitation." });
    } finally {
      setInviting(false);
    }
  }

  async function onChangeRole(memberId: string, role: OrgRole) {
    if (!canManage || busyId) return;
    setBusyId(memberId);
    setStatus(null);
    try {
      const res = await authClient.organization.updateMemberRole({
        memberId,
        role,
        organizationId: orgId,
      });
      report(res, "Role updated.");
    } catch {
      setStatus({ kind: "error", message: "Could not update the role." });
    } finally {
      setBusyId(null);
    }
  }

  async function onRemove(memberId: string, name: string) {
    if (!canManage || busyId) return;
    if (!confirm(`Remove ${name} from the organization?`)) return;
    setBusyId(memberId);
    setStatus(null);
    try {
      const res = await authClient.organization.removeMember({
        memberIdOrEmail: memberId,
        organizationId: orgId,
      });
      report(res, `${name} was removed.`);
    } catch {
      setStatus({ kind: "error", message: "Could not remove the member." });
    } finally {
      setBusyId(null);
    }
  }

  async function onCancelInvite(invitationId: string, email: string) {
    if (!canManage || busyId) return;
    setBusyId(invitationId);
    setStatus(null);
    try {
      const res = await authClient.organization.cancelInvitation({ invitationId });
      report(res, `Invitation to ${email} cancelled.`);
    } catch {
      setStatus({ kind: "error", message: "Could not cancel the invitation." });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-3xl">
      <SettingsHeader
        title="Members"
        description={
          canManage
            ? "Invite teammates and manage their access."
            : "People in your organization. Only owners and admins can make changes."
        }
      />

      {canManage && (
        <form onSubmit={onInvite} className="mb-6">
          <SettingsCard>
            <div className="flex items-center gap-2 text-sm font-medium text-fg">
              <UserPlus className="size-4 text-fg-muted" />
              Invite a member
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="grid flex-1 gap-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="teammate@company.com"
                  autoComplete="off"
                />
              </div>
              <div className="grid gap-2 sm:w-40">
                <Label htmlFor="invite-role">Role</Label>
                <Select
                  value={inviteRole}
                  onValueChange={(v) => setInviteRole(v as OrgRole)}
                >
                  <SelectTrigger id="invite-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {inviteRoles.map((r) => (
                      <SelectItem key={r} value={r} className="capitalize">
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={inviting}>
                {inviting ? "Sending…" : "Invite"}
              </Button>
            </div>
          </SettingsCard>
        </form>
      )}

      <StatusBanner status={status} />

      <section className="mt-6">
        <h3 className="mb-2 text-sm font-medium text-fg">
          Members <span className="text-fg-subtle">({view.members.length})</span>
        </h3>
        <div className="overflow-hidden rounded-[10px] border border-hairline">
          {view.members.map((m, i) => {
            const rowBusy = busyId === m.id;
            // Owners can't be demoted/removed through this UI; non-owners can't
            // target the current viewer either (avoid self-lockout surprises).
            const canEditRow = canManage && m.role !== "owner" && !m.isViewer;
            return (
              <div
                key={m.id}
                className={
                  "flex items-center gap-3 px-4 py-3" +
                  (i > 0 ? " border-t border-hairline" : "")
                }
              >
                <Avatar name={m.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-fg">
                    {m.name}
                    {m.isViewer && (
                      <span className="ml-1.5 text-xs font-normal text-fg-subtle">(you)</span>
                    )}
                  </div>
                  <div className="truncate text-xs text-fg-subtle">{m.email}</div>
                </div>

                {canEditRow ? (
                  <Select
                    value={m.role}
                    onValueChange={(v) => onChangeRole(m.id, v as OrgRole)}
                    disabled={rowBusy}
                  >
                    <SelectTrigger size="sm" className="w-28 capitalize" aria-label="Role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.filter((r) => r !== "owner").map((r) => (
                        <SelectItem key={r} value={r} className="capitalize">
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <RoleBadge role={m.role} />
                )}

                {canEditRow && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${m.name}`}
                    disabled={rowBusy}
                    onClick={() => onRemove(m.id, m.name)}
                    className="text-fg-muted hover:text-error"
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {view.invitations.length > 0 && (
        <section className="mt-8">
          <h3 className="mb-2 text-sm font-medium text-fg">
            Pending invitations{" "}
            <span className="text-fg-subtle">({view.invitations.length})</span>
          </h3>
          <div className="overflow-hidden rounded-[10px] border border-hairline">
            {view.invitations.map((inv, i) => {
              const rowBusy = busyId === inv.id;
              return (
                <div
                  key={inv.id}
                  className={
                    "flex items-center gap-3 px-4 py-3" +
                    (i > 0 ? " border-t border-hairline" : "")
                  }
                >
                  <span
                    className="grid size-8 shrink-0 place-items-center rounded-full border border-hairline bg-elevated text-fg-muted"
                    aria-hidden
                  >
                    <Mail className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-fg">{inv.email}</div>
                    <div className="text-xs text-fg-subtle">Invited as {inv.role}</div>
                  </div>
                  <RoleBadge role={inv.role} />
                  {canManage && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={rowBusy}
                      onClick={() => onCancelInvite(inv.id, inv.email)}
                      className="text-fg-muted hover:text-error"
                    >
                      {rowBusy ? "Cancelling…" : "Cancel"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!canManage && view.members.length === 0 && (
        <p className="mt-4 text-sm text-fg-muted">No members yet.</p>
      )}
    </div>
  );
}
