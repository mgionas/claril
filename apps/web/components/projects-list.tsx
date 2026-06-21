"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Boxes,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  SquareArrowOutUpRight,
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
import {
  createPersonalProject,
  deletePersonalProject,
  renamePersonalProject,
} from "@/lib/personal-actions";
import { cn } from "@/lib/utils";
import { NewDiagramDialog } from "@/components/new-diagram-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type ProjectsContext = "personal" | "org";

interface ProjectsListProps {
  projects: ProjectWithDiagrams[];
  /** Whether an AI provider is configured — gates the "Generate with AI" mode. */
  aiConnected: boolean;
  /** The active scope; routes CRUD to personal vs org server actions. */
  context: ProjectsContext;
  /**
   * The workspace hosting these projects (org scope only). Required for org
   * project creation, which is scoped to a concrete workspace.
   */
  workspaceId?: string;
  /** When true (e.g. workspace viewers), all create/rename/delete affordances are hidden. */
  readOnly?: boolean;
}

/**
 * The project-level mutations, resolved per active scope. Org creation is scoped
 * to `workspaceId` (the per-workspace page passes the real id).
 */
function projectActions(context: ProjectsContext, workspaceId?: string) {
  return context === "personal"
    ? {
        create: createPersonalProject,
        rename: renamePersonalProject,
        remove: deletePersonalProject,
      }
    : {
        create: (name: string): Promise<{ id: string }> => {
          if (!workspaceId) {
            throw new Error("Create projects from your workspace page.");
          }
          return createProject(workspaceId, name);
        },
        rename: renameProject,
        remove: deleteProject,
      };
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

export function ProjectsList({
  projects,
  aiConnected,
  context,
  workspaceId,
  readOnly = false,
}: ProjectsListProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const isPersonal = context === "personal";

  const diagramCount = useMemo(
    () => projects.reduce((sum, p) => sum + p.diagrams.length, 0),
    [projects],
  );

  return (
    <>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {projects.length === 0
              ? readOnly
                ? "No projects in this workspace yet."
                : "Browse and manage your diagrams across projects."
              : `${projects.length} ${
                  projects.length === 1 ? "project" : "projects"
                } · ${diagramCount} ${diagramCount === 1 ? "diagram" : "diagrams"}`}
          </p>
        </div>
        {!readOnly && (
          <Button onClick={() => setCreateOpen(true)}>
            <FolderPlus className="size-4" />
            New project
          </Button>
        )}
      </div>

      {projects.length === 0 ? (
        <EmptyState
          onCreate={readOnly ? undefined : () => setCreateOpen(true)}
          isPersonal={isPersonal}
        />
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-hairline bg-panel/40">
          {projects.map((project) => (
            <ProjectFolder
              key={project.id}
              project={project}
              aiConnected={aiConnected}
              context={context}
              workspaceId={workspaceId}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}

      {!readOnly && (
        <NewProjectDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          context={context}
          workspaceId={workspaceId}
        />
      )}
    </>
  );
}

function NewProjectDialog({
  open,
  onOpenChange,
  context,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: ProjectsContext;
  workspaceId?: string;
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
        await projectActions(context, workspaceId).create(trimmed);
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

function EmptyState({
  onCreate,
  isPersonal,
}: {
  onCreate?: () => void;
  isPersonal: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[10px] border border-dashed border-hairline bg-panel/40 px-6 py-20 text-center">
      <span className="grid size-12 place-items-center rounded-[10px] bg-elevated text-fg-subtle">
        <FolderPlus className="size-6" />
      </span>
      <p className="mt-4 text-sm font-medium">
        {isPersonal ? "No personal projects yet" : "No projects yet"}
      </p>
      <p className="mt-1 max-w-xs text-sm text-fg-muted">
        {onCreate
          ? "Create your first project to start designing BPMN, sequence, and C4 diagrams."
          : "An editor can add projects to start designing diagrams here."}
      </p>
      {onCreate && (
        <Button className="mt-5" onClick={onCreate}>
          <FolderPlus className="size-4" />
          New project
        </Button>
      )}
    </div>
  );
}

function ProjectFolder({
  project,
  aiConnected,
  context,
  workspaceId,
  readOnly = false,
}: {
  project: ProjectWithDiagrams;
  aiConnected: boolean;
  context: ProjectsContext;
  workspaceId?: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const actions = projectActions(context, workspaceId);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(project.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newDiagramOpen, setNewDiagramOpen] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const count = project.diagrams.length;

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
        await actions.rename(project.id, next);
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
        await actions.remove(project.id);
        setConfirmDelete(false);
        router.refresh();
      } catch (err) {
        setDeleteError(errorMessage(err));
      }
    });
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        "group border-b border-hairline transition-colors last:border-b-0",
        pending && "opacity-60",
      )}
    >
      <div className="relative flex items-center gap-2 pr-2 transition-colors hover:bg-elevated/40">
        {renaming ? (
          <form onSubmit={commitRename} className="flex flex-1 items-center gap-2 py-2 pl-3">
            <Folder className="size-4 shrink-0 text-fg-subtle" />
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
          <CollapsibleTrigger
            className="flex min-w-0 flex-1 items-center gap-2.5 py-2.5 pl-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            aria-label={`${open ? "Collapse" : "Expand"} ${project.name}`}
          >
            <ChevronRight className="size-4 shrink-0 text-fg-subtle transition-transform duration-150 group-data-[state=open]:rotate-90" />
            <span className="shrink-0 text-fg-muted">
              <Folder className="size-4 group-data-[state=open]:hidden" />
              <FolderOpen className="hidden size-4 group-data-[state=open]:block" />
            </span>
            <span className="truncate text-sm font-medium text-fg">{project.name}</span>
            <span className="shrink-0 text-xs text-fg-subtle">
              {count} {count === 1 ? "diagram" : "diagrams"}
            </span>
          </CollapsibleTrigger>
        )}

        {!readOnly && (
          <div className="flex shrink-0 items-center gap-1">
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
              context={context}
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
        )}
      </div>

      {renameError && (
        <p role="alert" className="px-3 pb-2 pl-[42px] text-xs text-destructive">
          {renameError}
        </p>
      )}

      <CollapsibleContent>
        <div className="border-t border-hairline bg-bg/30 pl-7">
          {count === 0 ? (
            readOnly ? (
              <p className="px-4 py-3.5 text-sm text-fg-subtle">No diagrams yet.</p>
            ) : (
              <button
                type="button"
                onClick={() => setNewDiagramOpen(true)}
                className="flex w-full items-center gap-2 px-4 py-3.5 text-left text-sm text-fg-subtle transition-colors hover:text-fg"
              >
                <Plus className="size-4" />
                No diagrams yet — create your first.
              </button>
            )
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-hairline hover:bg-transparent">
                  <TableHead className="px-3 text-xs font-medium text-fg-subtle">Name</TableHead>
                  <TableHead className="px-3 text-xs font-medium text-fg-subtle">Type</TableHead>
                  <TableHead className="px-3 text-xs font-medium text-fg-subtle">Edited</TableHead>
                  <TableHead className="w-10 px-3" aria-label="Actions" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {project.diagrams.map((d) => (
                  <DiagramRow
                    key={d.id}
                    id={d.id}
                    name={d.name}
                    kind={d.type}
                    updatedAt={d.updatedAt}
                    readOnly={readOnly}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CollapsibleContent>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(o) => {
          setConfirmDelete(o);
          if (!o) setDeleteError(null);
        }}
        title={`Delete “${project.name}”?`}
        description={`This permanently deletes the project and its ${count} diagram(s). This cannot be undone.`}
        confirmLabel="Delete project"
        pending={pending}
        error={deleteError}
        onConfirm={handleDelete}
      />
    </Collapsible>
  );
}

function DiagramRow({
  id,
  name,
  kind,
  updatedAt,
  readOnly = false,
}: {
  id: string;
  name: string;
  kind: DiagramKind;
  updatedAt: string;
  readOnly?: boolean;
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
    <>
      <TableRow className={cn("group border-hairline", pending && "opacity-60")}>
        <TableCell className="px-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-[6px] bg-elevated text-fg-subtle">
              <KindIcon className="size-3.5" />
            </span>
            {renaming ? (
              <form onSubmit={commit} className="min-w-0 flex-1">
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
              <Link href={`/d/${id}`} className="min-w-0">
                <span className="truncate text-sm text-fg transition-colors group-hover:text-accent">
                  {name}
                </span>
              </Link>
            )}
          </div>
          {renameError && (
            <p role="alert" className="mt-1 pl-[38px] text-xs text-destructive">
              {renameError}
            </p>
          )}
        </TableCell>

        <TableCell className="px-3">
          <Badge variant="outline" className="text-fg-muted">
            {KIND_LABEL[kind] ?? kind}
          </Badge>
        </TableCell>

        <TableCell className="px-3 text-xs text-fg-subtle">{relativeTime(updatedAt)}</TableCell>

        <TableCell className="px-3 text-right">
          <DropdownMenu>
            <DropdownMenuTrigger
              className="grid size-7 shrink-0 place-items-center rounded-[6px] text-fg-subtle opacity-0 outline-none transition-all hover:bg-elevated hover:text-fg focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/50 group-hover:opacity-100 disabled:opacity-50 aria-expanded:opacity-100"
              aria-label="Diagram actions"
              disabled={pending}
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onSelect={() => router.push(`/d/${id}`)}>
                <SquareArrowOutUpRight />
                Open
              </DropdownMenuItem>
              {!readOnly && (
                <>
                  <DropdownMenuItem onSelect={() => setRenaming(true)}>
                    <Pencil />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                    <Trash2 />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

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
    </>
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
