"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Boxes,
  ChevronRight,
  FileText,
  FolderPlus,
  GitBranch,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Workflow,
} from "lucide-react";
import type { DiagramKind } from "@/lib/default-diagram";
import {
  createProject,
  deleteDiagram,
  deleteProject,
  renameDiagram,
  renameProject,
  type ProjectWithDiagrams,
} from "@/lib/diagram-actions";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/app-shell";
import { NewDiagramDialog } from "@/components/new-diagram-dialog";
import { Button } from "@/components/ui/button";
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

interface DashboardProps {
  userName: string;
  userEmail?: string;
  projects: ProjectWithDiagrams[];
  /** Whether an AI provider is configured — gates the "Generate with AI" mode. */
  aiConnected: boolean;
}

const inputClass =
  "w-full rounded-[6px] border border-hairline bg-elevated px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-accent";

const KIND_ICON: Record<DiagramKind, typeof Workflow> = {
  bpmn: Workflow,
  sequence: GitBranch,
  c4: Boxes,
};

const KIND_LABEL: Record<DiagramKind, string> = {
  bpmn: "BPMN",
  sequence: "Sequence",
  c4: "C4",
};

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return "Something went wrong. Please try again.";
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function Dashboard({ userName, userEmail, projects, aiConnected }: DashboardProps) {
  const [createOpen, setCreateOpen] = useState(false);

  const diagramCount = useMemo(
    () => projects.reduce((sum, p) => sum + p.diagrams.length, 0),
    [projects],
  );

  return (
    <AppShell
      active="dashboard"
      userName={userName}
      userEmail={userEmail}
      actions={
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <FolderPlus className="size-4" />
          New project
        </Button>
      }
    >
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {projects.length === 0
              ? "Browse and manage your diagrams across projects."
              : `${projects.length} ${
                  projects.length === 1 ? "project" : "projects"
                } · ${diagramCount} ${diagramCount === 1 ? "diagram" : "diagrams"}`}
          </p>
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : (
        <div className="flex flex-col gap-4">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} aiConnected={aiConnected} />
          ))}
        </div>
      )}

      <NewProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </AppShell>
  );
}

function NewProjectDialog({
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
        await createProject(trimmed);
        setName("");
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
          setName("");
          setError(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="border-hairline bg-panel/95 text-fg backdrop-blur sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription className="text-fg-muted">
            Group related diagrams under a project.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-project-name" className="text-xs font-medium text-fg-subtle">
              Name
            </label>
            <input
              id="new-project-name"
              autoFocus
              className={inputClass}
              placeholder="e.g. Payments platform"
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
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[10px] border border-dashed border-hairline bg-panel/40 px-6 py-20 text-center">
      <span className="grid size-12 place-items-center rounded-[10px] bg-elevated text-fg-subtle">
        <FolderPlus className="size-6" />
      </span>
      <p className="mt-4 text-sm font-medium">No projects yet</p>
      <p className="mt-1 max-w-xs text-sm text-fg-muted">
        Create your first project to start designing BPMN, sequence, and C4 diagrams.
      </p>
      <Button className="mt-5" onClick={onCreate}>
        <FolderPlus className="size-4" />
        New project
      </Button>
    </div>
  );
}

function ProjectCard({
  project,
  aiConnected,
}: {
  project: ProjectWithDiagrams;
  aiConnected: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(project.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newDiagramOpen, setNewDiagramOpen] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function commitRename(e: FormEvent) {
    e.preventDefault();
    const next = name.trim();
    if (!next || next === project.name) {
      setRenaming(false);
      setName(project.name);
      setRenameError(null);
      return;
    }
    setRenameError(null);
    startTransition(async () => {
      try {
        await renameProject(project.id, next);
        setRenaming(false);
        router.refresh();
      } catch (err) {
        setRenameError(errorMessage(err));
        setName(project.name);
        setRenaming(false);
      }
    });
  }

  function handleDelete() {
    setDeleteError(null);
    startTransition(async () => {
      try {
        await deleteProject(project.id);
        setConfirmDelete(false);
        router.refresh();
      } catch (err) {
        setDeleteError(errorMessage(err));
      }
    });
  }

  return (
    <section
      className={cn(
        "rounded-[10px] border border-hairline bg-panel/60 transition-colors",
        pending && "opacity-60",
      )}
    >
      <div className="flex items-center gap-1 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="grid size-7 shrink-0 place-items-center rounded-[6px] text-fg-subtle transition-colors hover:bg-elevated hover:text-fg"
          aria-label={open ? "Collapse project" : "Expand project"}
          aria-expanded={open}
        >
          <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
        </button>

        {renaming ? (
          <form onSubmit={commitRename} className="flex flex-1 items-center">
            <input
              autoFocus
              className={cn(inputClass, "py-1")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setRenaming(false);
                  setName(project.name);
                }
              }}
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex flex-1 items-center gap-2 truncate text-left"
          >
            <span className="truncate text-sm font-medium">{project.name}</span>
            <span className="shrink-0 rounded-full bg-elevated px-1.5 py-0.5 text-[11px] tabular-nums text-fg-subtle">
              {project.diagrams.length}
            </span>
          </button>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="text-fg-muted"
          onClick={() => setNewDiagramOpen(true)}
          disabled={pending}
        >
          <Plus className="size-4" />
          <span className="hidden sm:inline">New diagram</span>
        </Button>

        <NewDiagramDialog
          projectId={project.id}
          open={newDiagramOpen}
          onOpenChange={setNewDiagramOpen}
          aiConnected={aiConnected}
        />

        <DropdownMenu>
          <DropdownMenuTrigger
            className="grid size-7 shrink-0 place-items-center rounded-[6px] text-fg-subtle outline-none transition-colors hover:bg-elevated hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-50"
            aria-label="Project actions"
            disabled={pending}
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onSelect={() => setRenaming(true)}>
              <Pencil />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {renameError && (
        <p
          role="alert"
          className="border-t border-hairline px-3 py-2 text-xs text-destructive"
        >
          {renameError}
        </p>
      )}

      {open && (
        <div className="border-t border-hairline">
          {project.diagrams.length === 0 ? (
            <button
              type="button"
              onClick={() => setNewDiagramOpen(true)}
              className="flex w-full items-center gap-2 px-4 py-4 text-left text-sm text-fg-subtle transition-colors hover:text-fg"
            >
              <Plus className="size-4" />
              No diagrams yet — create your first.
            </button>
          ) : (
            <ul>
              {project.diagrams.map((d) => (
                <DiagramRow
                  key={d.id}
                  id={d.id}
                  name={d.name}
                  kind={d.type}
                  updatedAt={d.updatedAt}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(o) => {
          setConfirmDelete(o);
          if (!o) setDeleteError(null);
        }}
        title={`Delete “${project.name}”?`}
        description={`This permanently deletes the project and its ${project.diagrams.length} diagram(s). This cannot be undone.`}
        confirmLabel="Delete project"
        pending={pending}
        error={deleteError}
        onConfirm={handleDelete}
      />
    </section>
  );
}

function DiagramRow({
  id,
  name,
  kind,
  updatedAt,
}: {
  id: string;
  name: string;
  kind: DiagramKind;
  updatedAt: string;
}) {
  const KindIcon = KIND_ICON[kind] ?? FileText;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [renaming, setRenaming] = useState(false);
  const [value, setValue] = useState(name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function commit(e: FormEvent) {
    e.preventDefault();
    const next = value.trim();
    if (!next || next === name) {
      setRenaming(false);
      setValue(name);
      setRenameError(null);
      return;
    }
    setRenameError(null);
    startTransition(async () => {
      try {
        await renameDiagram(id, next);
        setRenaming(false);
        router.refresh();
      } catch (err) {
        setRenameError(errorMessage(err));
        setValue(name);
        setRenaming(false);
      }
    });
  }

  function handleDelete() {
    setDeleteError(null);
    startTransition(async () => {
      try {
        await deleteDiagram(id);
        setConfirmDelete(false);
        router.refresh();
      } catch (err) {
        setDeleteError(errorMessage(err));
      }
    });
  }

  return (
    <li
      className={cn(
        "group border-b border-hairline px-3 py-2 transition-colors last:border-b-0 hover:bg-elevated/40",
        pending && "opacity-60",
      )}
    >
      <div className="flex items-center gap-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-[6px] bg-elevated text-fg-subtle">
        <KindIcon className="size-3.5" />
      </span>

      {renaming ? (
        <form onSubmit={commit} className="flex-1">
          <input
            autoFocus
            className={cn(inputClass, "py-1")}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setRenaming(false);
                setValue(name);
              }
            }}
          />
        </form>
      ) : (
        <Link href={`/d/${id}`} className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-sm text-fg transition-colors group-hover:text-accent">
            {name}
          </span>
          <span className="shrink-0 text-[11px] text-fg-subtle">{KIND_LABEL[kind] ?? kind}</span>
        </Link>
      )}

      <span className="shrink-0 text-xs text-fg-subtle">{relativeTime(updatedAt)}</span>

      <DropdownMenu>
        <DropdownMenuTrigger
          className="grid size-7 shrink-0 place-items-center rounded-[6px] text-fg-subtle opacity-0 outline-none transition-all hover:bg-elevated hover:text-fg focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/50 group-hover:opacity-100 disabled:opacity-50 aria-expanded:opacity-100"
          aria-label="Diagram actions"
          disabled={pending}
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <Pencil />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </div>

      {renameError && (
        <p role="alert" className="mt-1 pl-10 text-xs text-destructive">
          {renameError}
        </p>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(o) => {
          setConfirmDelete(o);
          if (!o) setDeleteError(null);
        }}
        title={`Delete “${name}”?`}
        description="This permanently deletes the diagram. This cannot be undone."
        confirmLabel="Delete diagram"
        pending={pending}
        error={deleteError}
        onConfirm={handleDelete}
      />
    </li>
  );
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  pending: boolean;
  error?: string | null;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="border-hairline bg-panel/95 text-fg backdrop-blur sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-fg-muted">{description}</DialogDescription>
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
          <Button type="button" variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
