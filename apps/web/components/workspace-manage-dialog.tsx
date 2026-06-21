"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, UserPlus } from "lucide-react";
import {
  addWorkspaceMember,
  deleteWorkspace,
  listWorkspaceMembers,
  removeWorkspaceMember,
  renameWorkspace,
  setWorkspaceMemberRole,
  type WorkspaceMemberView,
} from "@/lib/workspace-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AssignableWsRole = "admin" | "editor" | "viewer";

const ASSIGNABLE_ROLES: AssignableWsRole[] = ["admin", "editor", "viewer"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Legacy `member` rows surface as `editor` everywhere in the UI. */
function displayRole(role: WorkspaceMemberView["role"]): AssignableWsRole {
  return role === "member" ? "editor" : role;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return "Something went wrong. Please try again.";
}

type Status = { kind: "success" | "error"; message: string } | null;

interface WorkspaceManageDialogProps {
  workspaceId: string;
  workspaceName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Admin dialog for a single workspace: rename, members table (role select +
 * remove), add member by org email, and a danger-zone delete. Callers gate the
 * trigger behind `canDo(role, "manage")`; the server actions remain the real
 * auth boundary, so this UI gate is purely a convenience. Mirrors the org
 * members-manager idioms (table, role Select, inline status, confirms).
 */
export function WorkspaceManageDialog({
  workspaceId,
  workspaceName,
  open,
  onOpenChange,
}: WorkspaceManageDialogProps) {
  const router = useRouter();

  const [status, setStatus] = useState<Status>(null);

  // Rename section.
  const [name, setName] = useState(workspaceName);
  const [renaming, setRenaming] = useState(false);

  // Members section.
  const [members, setMembers] = useState<WorkspaceMemberView[] | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  // Add-member form.
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AssignableWsRole>("editor");
  const [adding, setAdding] = useState(false);

  // Danger zone.
  const [deleting, setDeleting] = useState(false);

  const adminCount =
    members?.filter((m) => displayRole(m.role) === "admin").length ?? 0;

  const loadMembers = useCallback(async () => {
    setLoadingMembers(true);
    try {
      const rows = await listWorkspaceMembers(workspaceId);
      setMembers(rows);
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err) });
    } finally {
      setLoadingMembers(false);
    }
  }, [workspaceId]);

  // Load members + reset transient state whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setName(workspaceName);
    setStatus(null);
    setInviteEmail("");
    setInviteRole("editor");
    void loadMembers();
  }, [open, workspaceName, loadMembers]);

  async function onRename(e: React.FormEvent) {
    e.preventDefault();
    if (renaming) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === workspaceName) return;
    setRenaming(true);
    setStatus(null);
    try {
      await renameWorkspace(workspaceId, trimmed);
      setStatus({ kind: "success", message: "Workspace renamed." });
      router.refresh();
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err) });
    } finally {
      setRenaming(false);
    }
  }

  async function onChangeRole(member: WorkspaceMemberView, role: AssignableWsRole) {
    if (busyUserId || role === displayRole(member.role)) return;
    // Best-effort lockout guard: don't demote the only admin.
    if (displayRole(member.role) === "admin" && role !== "admin" && adminCount <= 1) {
      setStatus({
        kind: "error",
        message: "A workspace needs at least one admin. Promote someone else first.",
      });
      return;
    }
    setBusyUserId(member.userId);
    setStatus(null);
    try {
      await setWorkspaceMemberRole(workspaceId, member.userId, role);
      setStatus({ kind: "success", message: "Role updated." });
      await loadMembers();
      router.refresh();
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusyUserId(null);
    }
  }

  async function onRemove(member: WorkspaceMemberView) {
    if (busyUserId) return;
    // Best-effort lockout guard: don't remove the only admin.
    if (displayRole(member.role) === "admin" && adminCount <= 1) {
      setStatus({
        kind: "error",
        message: "A workspace needs at least one admin. Promote someone else first.",
      });
      return;
    }
    if (!confirm(`Remove ${member.name} from “${workspaceName}”?`)) return;
    setBusyUserId(member.userId);
    setStatus(null);
    try {
      await removeWorkspaceMember(workspaceId, member.userId);
      setStatus({ kind: "success", message: `${member.name} was removed.` });
      await loadMembers();
      router.refresh();
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusyUserId(null);
    }
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (adding) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      setStatus({ kind: "error", message: "Enter a valid email address." });
      return;
    }
    setAdding(true);
    setStatus(null);
    try {
      await addWorkspaceMember(workspaceId, email, inviteRole);
      setStatus({ kind: "success", message: `${email} was added.` });
      setInviteEmail("");
      await loadMembers();
      router.refresh();
    } catch (err) {
      // Surfaces "must be an org member" and similar action errors inline.
      setStatus({ kind: "error", message: errorMessage(err) });
    } finally {
      setAdding(false);
    }
  }

  async function onDelete() {
    if (deleting) return;
    if (
      !confirm(
        `Delete “${workspaceName}”? This permanently removes the workspace and all of its projects and diagrams. This cannot be undone.`,
      )
    )
      return;
    setDeleting(true);
    setStatus(null);
    try {
      await deleteWorkspace(workspaceId);
      onOpenChange(false);
      router.push("/");
    } catch (err) {
      setStatus({ kind: "error", message: errorMessage(err) });
      setDeleting(false);
    }
  }

  const anyBusy = renaming || adding || deleting || busyUserId !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (anyBusy) return;
        onOpenChange(o);
      }}
    >
      <DialogContent className="border-hairline bg-panel/95 text-fg backdrop-blur sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage workspace</DialogTitle>
          <DialogDescription className="text-fg-muted">
            Rename, manage members and roles, or delete this workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[70vh] flex-col gap-7 overflow-y-auto pr-1">
          {status && (
            <p
              role="status"
              aria-live="polite"
              className={
                status.kind === "error"
                  ? "text-sm text-destructive"
                  : "text-sm text-fg-muted"
              }
            >
              {status.message}
            </p>
          )}

          {/* Rename */}
          <form onSubmit={onRename} className="flex flex-col gap-2">
            <Label htmlFor="ws-rename">Name</Label>
            <div className="flex gap-2">
              <Input
                id="ws-rename"
                value={name}
                disabled={renaming}
                onChange={(e) => setName(e.target.value)}
                className="flex-1"
              />
              <Button
                type="submit"
                variant="outline"
                disabled={renaming || !name.trim() || name.trim() === workspaceName}
              >
                {renaming && <Loader2 className="size-4 animate-spin" />}
                Save
              </Button>
            </div>
          </form>

          {/* Members */}
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-fg">
              Members{" "}
              {members && <span className="text-fg-subtle">({members.length})</span>}
            </h3>
            <div className="overflow-hidden rounded-[10px] border border-hairline">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4">Member</TableHead>
                    <TableHead className="px-4">Role</TableHead>
                    <TableHead className="px-4 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingMembers && !members ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={3} className="px-4 py-6 text-center text-sm text-fg-subtle">
                        <Loader2 className="mx-auto size-4 animate-spin" />
                      </TableCell>
                    </TableRow>
                  ) : members && members.length > 0 ? (
                    members.map((m) => {
                      const rowBusy = busyUserId === m.userId;
                      return (
                        <TableRow key={m.userId} className="hover:bg-transparent">
                          <TableCell className="px-4 py-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-fg">
                                {m.name}
                              </div>
                              <div className="truncate text-xs text-fg-subtle">
                                {m.email}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <Select
                              value={displayRole(m.role)}
                              onValueChange={(v) => onChangeRole(m, v as AssignableWsRole)}
                              disabled={rowBusy}
                            >
                              <SelectTrigger
                                size="sm"
                                className="w-28 capitalize"
                                aria-label="Role"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ASSIGNABLE_ROLES.map((r) => (
                                  <SelectItem key={r} value={r} className="capitalize">
                                    {r}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Remove ${m.name}`}
                              disabled={rowBusy}
                              onClick={() => onRemove(m)}
                              className="text-fg-muted hover:text-error"
                            >
                              {rowBusy ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Trash2 />
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={3} className="px-4 py-6 text-center text-sm text-fg-subtle">
                        No members yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          {/* Add member */}
          <form onSubmit={onAdd} className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-fg">
              <UserPlus className="size-4 text-fg-muted" />
              Add a member
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="grid flex-1 gap-2">
                <Label htmlFor="ws-add-email">Email</Label>
                <Input
                  id="ws-add-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="teammate@company.com"
                  autoComplete="off"
                  disabled={adding}
                />
              </div>
              <div className="grid gap-2 sm:w-40">
                <Label htmlFor="ws-add-role">Role</Label>
                <Select
                  value={inviteRole}
                  onValueChange={(v) => setInviteRole(v as AssignableWsRole)}
                  disabled={adding}
                >
                  <SelectTrigger id="ws-add-role" className="w-full capitalize">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSIGNABLE_ROLES.map((r) => (
                      <SelectItem key={r} value={r} className="capitalize">
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={adding || !inviteEmail.trim()}>
                {adding && <Loader2 className="size-4 animate-spin" />}
                Add
              </Button>
            </div>
            <p className="text-xs text-fg-subtle">
              The person must already be a member of this organization.
            </p>
          </form>

          {/* Danger zone */}
          <section className="flex flex-col gap-3 rounded-[10px] border border-destructive/30 bg-destructive/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-fg">Delete workspace</h3>
                  <Badge variant="outline" className="border-destructive/40 text-destructive">
                    Danger
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-fg-muted">
                  Permanently removes the workspace and all of its projects and diagrams.
                </p>
              </div>
              <Button
                type="button"
                variant="destructive"
                disabled={deleting}
                onClick={onDelete}
                className="shrink-0"
              >
                {deleting && <Loader2 className="size-4 animate-spin" />}
                Delete
              </Button>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
