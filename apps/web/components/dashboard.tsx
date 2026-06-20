"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Boxes,
  ChevronDown,
  FileText,
  FolderPlus,
  GitBranch,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Workflow,
} from "lucide-react";
import type { DiagramKind } from "@/lib/default-diagram";
import {
  createDiagram,
  createProject,
  deleteDiagram,
  deleteProject,
  renameDiagram,
  renameProject,
  type ProjectWithDiagrams,
} from "@/lib/diagram-actions";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

interface DashboardProps {
  userName: string;
  projects: ProjectWithDiagrams[];
}

const inputClass =
  "rounded-[6px] border border-hairline bg-elevated px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-accent";

const DIAGRAM_KINDS: {
  kind: DiagramKind;
  label: string;
  description: string;
  icon: typeof Workflow;
}[] = [
  { kind: "bpmn", label: "BPMN process", description: "bpmn-js canvas", icon: Workflow },
  { kind: "sequence", label: "Sequence", description: "Mermaid", icon: GitBranch },
  { kind: "c4", label: "C4 model", description: "Mermaid", icon: Boxes },
];

const KIND_ICON: Record<DiagramKind, typeof Workflow> = {
  bpmn: Workflow,
  sequence: GitBranch,
  c4: Boxes,
};

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

export function Dashboard({ userName, projects }: DashboardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  async function handleSignOut() {
    await signOut();
    router.push("/sign-in");
    router.refresh();
  }

  function submitNewProject(e: FormEvent) {
    e.preventDefault();
    const name = newProjectName.trim();
    if (!name) return;
    startTransition(async () => {
      await createProject(name);
      setNewProjectName("");
      setCreatingProject(false);
      router.refresh();
    });
  }

  return (
    <main className="min-h-screen bg-canvas text-fg">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-hairline bg-canvas/80 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-accent" />
          <span className="text-sm font-semibold">Claril</span>
          <span className="text-fg-subtle">/</span>
          <span className="text-sm text-fg-muted">Projects</span>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          title={`Sign out (${userName})`}
          className="flex items-center gap-1.5 rounded-[6px] border border-hairline bg-panel/80 px-3 py-1.5 text-fg-muted transition-colors hover:text-fg"
        >
          <LogOut className="size-3.5" />
        </button>
      </header>

      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-medium">Projects</h1>
            <p className="mt-1 text-sm text-fg-muted">
              Browse and manage your diagrams across projects.
            </p>
          </div>
          {!creatingProject && (
            <button
              type="button"
              onClick={() => setCreatingProject(true)}
              className="flex items-center gap-1.5 rounded-[6px] bg-accent px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              <FolderPlus className="size-4" />
              New project
            </button>
          )}
        </div>

        {creatingProject && (
          <form
            onSubmit={submitNewProject}
            className="mb-6 flex items-center gap-2 rounded-[10px] border border-hairline bg-panel/60 p-3"
          >
            <input
              autoFocus
              className={cn(inputClass, "flex-1")}
              placeholder="Project name"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setCreatingProject(false);
                  setNewProjectName("");
                }
              }}
            />
            <button
              type="submit"
              disabled={pending || !newProjectName.trim()}
              className="rounded-[6px] bg-accent px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setCreatingProject(false);
                setNewProjectName("");
              }}
              className="rounded-[6px] border border-hairline px-3 py-2 text-sm text-fg-muted transition-colors hover:text-fg"
            >
              Cancel
            </button>
          </form>
        )}

        {projects.length === 0 && !creatingProject ? (
          <EmptyState onCreate={() => setCreatingProject(true)} />
        ) : (
          <div className="flex flex-col gap-4">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[10px] border border-dashed border-hairline bg-panel/40 px-6 py-16 text-center">
      <FolderPlus className="size-8 text-fg-subtle" />
      <p className="mt-3 text-sm font-medium">No projects yet</p>
      <p className="mt-1 text-sm text-fg-muted">
        Create your first project to start designing diagrams.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-4 flex items-center gap-1.5 rounded-[6px] bg-accent px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        <FolderPlus className="size-4" />
        New project
      </button>
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectWithDiagrams }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(project.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const [kindMenuOpen, setKindMenuOpen] = useState(false);

  function commitRename(e: FormEvent) {
    e.preventDefault();
    const next = name.trim();
    if (!next || next === project.name) {
      setRenaming(false);
      setName(project.name);
      return;
    }
    startTransition(async () => {
      await renameProject(project.id, next);
      setRenaming(false);
      router.refresh();
    });
  }

  function handleDelete() {
    if (
      !confirm(
        `Delete project “${project.name}” and its ${project.diagrams.length} diagram(s)? This cannot be undone.`,
      )
    )
      return;
    startTransition(async () => {
      await deleteProject(project.id);
      router.refresh();
    });
  }

  function handleNewDiagram(kind: DiagramKind) {
    setKindMenuOpen(false);
    startTransition(async () => {
      const { id } = await createDiagram(project.id, kind);
      router.push(`/d/${id}`);
    });
  }

  return (
    <section className="rounded-[10px] border border-hairline bg-panel/60">
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-fg-subtle transition-colors hover:text-fg"
          aria-label={open ? "Collapse" : "Expand"}
        >
          <ChevronDown className={cn("size-4 transition-transform", !open && "-rotate-90")} />
        </button>

        {renaming ? (
          <form onSubmit={commitRename} className="flex flex-1 items-center gap-2">
            <input
              autoFocus
              className={cn(inputClass, "flex-1 py-1")}
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
            className="flex-1 text-left text-sm font-medium"
          >
            {project.name}
            <span className="ml-2 text-xs text-fg-subtle">
              {project.diagrams.length} {project.diagrams.length === 1 ? "diagram" : "diagrams"}
            </span>
          </button>
        )}

        <div className="relative">
          <button
            type="button"
            onClick={() => setKindMenuOpen((m) => !m)}
            onBlur={() => setTimeout(() => setKindMenuOpen(false), 120)}
            disabled={pending}
            aria-haspopup="menu"
            aria-expanded={kindMenuOpen}
            className="flex items-center gap-1.5 rounded-[6px] border border-hairline px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
          >
            <Plus className="size-3.5" />
            New diagram
            <ChevronDown className="size-3" />
          </button>
          {kindMenuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-[8px] border border-hairline bg-elevated py-1 backdrop-blur"
            >
              {DIAGRAM_KINDS.map(({ kind, label, description, icon: Icon }) => (
                <button
                  key={kind}
                  type="button"
                  role="menuitem"
                  onMouseDown={() => handleNewDiagram(kind)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-panel"
                >
                  <Icon className="size-4 shrink-0 text-fg-subtle" />
                  <span className="flex flex-col">
                    <span className="text-sm text-fg">{label}</span>
                    <span className="text-[11px] text-fg-subtle">{description}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((m) => !m)}
            onBlur={() => setTimeout(() => setMenuOpen(false), 120)}
            className="rounded-[6px] p-1.5 text-fg-subtle transition-colors hover:text-fg"
            aria-label="Project actions"
          >
            <MoreHorizontal className="size-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-[8px] border border-hairline bg-elevated py-1 backdrop-blur">
              <button
                type="button"
                onMouseDown={() => {
                  setRenaming(true);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg-muted transition-colors hover:bg-panel hover:text-fg"
              >
                <Pencil className="size-3.5" />
                Rename
              </button>
              <button
                type="button"
                onMouseDown={handleDelete}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-error transition-colors hover:bg-panel"
              >
                <Trash2 className="size-3.5" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {open && (
        <div className="border-t border-hairline">
          {project.diagrams.length === 0 ? (
            <p className="px-4 py-4 text-sm text-fg-subtle">
              No diagrams yet — create one to get started.
            </p>
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
  const [menuOpen, setMenuOpen] = useState(false);

  function commit(e: FormEvent) {
    e.preventDefault();
    const next = value.trim();
    if (!next || next === name) {
      setRenaming(false);
      setValue(name);
      return;
    }
    startTransition(async () => {
      await renameDiagram(id, next);
      setRenaming(false);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm(`Delete diagram “${name}”? This cannot be undone.`)) return;
    startTransition(async () => {
      await deleteDiagram(id);
      router.refresh();
    });
  }

  return (
    <li className="group flex items-center gap-3 border-b border-hairline px-4 py-2.5 last:border-b-0">
      <KindIcon className="size-4 shrink-0 text-fg-subtle" />
      {renaming ? (
        <form onSubmit={commit} className="flex-1">
          <input
            autoFocus
            className={cn(inputClass, "w-full py-1")}
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
        <Link href={`/d/${id}`} className="flex-1 truncate text-sm hover:text-accent">
          {name}
        </Link>
      )}
      <span className="text-xs text-fg-subtle">{relativeTime(updatedAt)}</span>

      <div className="relative opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={() => setMenuOpen((m) => !m)}
          onBlur={() => setTimeout(() => setMenuOpen(false), 120)}
          disabled={pending}
          className="rounded-[6px] p-1.5 text-fg-subtle transition-colors hover:text-fg"
          aria-label="Diagram actions"
        >
          <MoreHorizontal className="size-4" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-[8px] border border-hairline bg-elevated py-1 backdrop-blur">
            <button
              type="button"
              onMouseDown={() => {
                setRenaming(true);
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-fg-muted transition-colors hover:bg-panel hover:text-fg"
            >
              <Pencil className="size-3.5" />
              Rename
            </button>
            <button
              type="button"
              onMouseDown={handleDelete}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-error transition-colors hover:bg-panel"
            >
              <Trash2 className="size-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
