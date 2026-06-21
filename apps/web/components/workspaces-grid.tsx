"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FolderKanban,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import type { WorkspaceSummary } from "@/lib/workspace-actions";
import {
  createWorkspace,
  deleteWorkspace,
  renameWorkspace,
} from "@/lib/workspace-actions";
import type { DashboardStats } from "@/lib/dashboard-stats-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WorkspaceManageDialog } from "@/components/workspace-manage-dialog";

interface WorkspacesGridProps {
  workspaces: WorkspaceSummary[];
  stats: DashboardStats;
}

const inputClass =
  "w-full rounded-[6px] border border-hairline bg-elevated px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-accent";

const numberFmt = new Intl.NumberFormat("en-US");

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return "Something went wrong. Please try again.";
}

export function WorkspacesGrid({ workspaces, stats }: WorkspacesGridProps) {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workspaces</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Organize projects and diagrams into workspaces your team can share.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          New workspace
        </Button>
      </div>

      {/* Slim stat strip — org-wide totals across visible workspaces. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Projects" value={numberFmt.format(stats.projectCount)} />
        <StatCard label="Diagrams" value={numberFmt.format(stats.diagramCount)} />
      </div>

      {workspaces.length === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((ws) => (
            <WorkspaceCard key={ws.id} workspace={ws} />
          ))}
        </div>
      )}

      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="gap-2 py-5">
      <CardHeader className="pb-0">
        <CardDescription className="text-fg-subtle">{label}</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums tracking-tight">
          {value}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

function WorkspaceCard({ workspace }: { workspace: WorkspaceSummary }) {
  const isAdmin = workspace.role === "admin";
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  return (
    <>
      <Card className="group relative gap-0 py-0 transition-colors hover:border-accent/60">
        <Link
          href={`/w/${workspace.id}`}
          className="flex flex-col gap-3 rounded-[10px] p-5 outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-[8px] bg-elevated text-fg-muted">
              <FolderKanban className="size-4.5" />
            </span>
            {/* Reserve space so the overflow trigger doesn't overlap the title. */}
            {isAdmin && <span className="size-7 shrink-0" aria-hidden />}
          </div>
          <div>
            <p className="truncate text-sm font-medium text-fg transition-colors group-hover:text-accent">
              {workspace.name}
            </p>
            <p className="mt-1 text-xs text-fg-subtle">
              {workspace.projectCount}{" "}
              {workspace.projectCount === 1 ? "project" : "projects"} ·{" "}
              {workspace.diagramCount}{" "}
              {workspace.diagramCount === 1 ? "diagram" : "diagrams"}
            </p>
          </div>
          <Badge variant="outline" className="capitalize text-fg-muted">
            {workspace.role === "member" ? "editor" : workspace.role}
          </Badge>
        </Link>

        {isAdmin && (
          <div className="absolute right-3 top-3">
            <DropdownMenu>
              <DropdownMenuTrigger
                className="grid size-7 place-items-center rounded-[6px] text-fg-subtle outline-none transition-colors hover:bg-elevated hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/50"
                aria-label={`Actions for ${workspace.name}`}
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
                  <Pencil />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setManageOpen(true)}>
                  <Users />
                  Manage members
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </Card>

      <RenameWorkspaceDialog
        workspace={workspace}
        open={renameOpen}
        onOpenChange={setRenameOpen}
      />
      <DeleteWorkspaceDialog
        workspace={workspace}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
      <WorkspaceManageDialog
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        open={manageOpen}
        onOpenChange={setManageOpen}
      />
    </>
  );
}

function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      try {
        const { id } = await createWorkspace(trimmed);
        setName("");
        onOpenChange(false);
        router.push(`/w/${id}`);
      } catch (err) {
        setError(errorMessage(err));
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        if (!o) {
          setName("");
          setError(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="border-hairline bg-panel/95 text-fg backdrop-blur sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New workspace</DialogTitle>
          <DialogDescription className="text-fg-muted">
            Workspaces group projects and diagrams for a team or initiative.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-workspace-name" className="text-xs font-medium text-fg-subtle">
              Name
            </label>
            <input
              id="new-workspace-name"
              autoFocus
              className={inputClass}
              placeholder="e.g. Platform team"
              value={name}
              disabled={pending}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Create workspace
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameWorkspaceDialog({
  workspace,
  open,
  onOpenChange,
}: {
  workspace: WorkspaceSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(workspace.name);
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === workspace.name) {
      onOpenChange(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await renameWorkspace(workspace.id, trimmed);
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        setError(errorMessage(err));
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        if (!o) {
          setName(workspace.name);
          setError(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="border-hairline bg-panel/95 text-fg backdrop-blur sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename workspace</DialogTitle>
          <DialogDescription className="text-fg-muted">
            Give this workspace a clear, recognizable name.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="rename-workspace-name" className="text-xs font-medium text-fg-subtle">
              Name
            </label>
            <input
              id="rename-workspace-name"
              autoFocus
              className={inputClass}
              value={name}
              disabled={pending}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteWorkspaceDialog({
  workspace,
  open,
  onOpenChange,
}: {
  workspace: WorkspaceSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteWorkspace(workspace.id);
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        setError(errorMessage(err));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="border-hairline bg-panel/95 text-fg backdrop-blur sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete “{workspace.name}”?</DialogTitle>
          <DialogDescription className="text-fg-muted">
            This permanently deletes the workspace and all {workspace.projectCount} project(s)
            and {workspace.diagramCount} diagram(s) within it. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={handleDelete}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Delete workspace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[10px] border border-dashed border-hairline bg-panel/40 px-6 py-20 text-center">
      <span className="grid size-12 place-items-center rounded-[10px] bg-elevated text-fg-subtle">
        <FolderKanban className="size-6" />
      </span>
      <p className="mt-4 text-sm font-medium">No workspaces yet</p>
      <p className="mt-1 max-w-xs text-sm text-fg-muted">
        Create your first workspace to start organizing projects and diagrams for your team.
      </p>
      <Button className="mt-5" onClick={onCreate}>
        <Plus className="size-4" />
        New workspace
      </Button>
    </div>
  );
}
