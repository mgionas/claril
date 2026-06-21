"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@claril/db";
import { requireUserId } from "@/lib/session";
import { defaultNameForKind, seedForKind, type DiagramKind } from "@/lib/default-diagram";
import {
  assertDiagramAccess,
  assertProjectAccess,
  requireWorkspaceRole,
} from "@/lib/tenancy";

export interface DiagramSummary {
  id: string;
  name: string;
  type: "bpmn" | "sequence" | "c4";
  updatedAt: string;
}

export interface ProjectWithDiagrams {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
  diagrams: DiagramSummary[];
}

/** List a workspace's projects, each with its diagrams. */
export async function listProjects(workspaceId: string): Promise<ProjectWithDiagrams[]> {
  const userId = await requireUserId();
  await requireWorkspaceRole(userId, workspaceId, "view");

  const projects = await db
    .select()
    .from(schema.project)
    .where(eq(schema.project.workspaceId, workspaceId))
    .orderBy(desc(schema.project.updatedAt));

  if (projects.length === 0) return [];

  const projectIds = projects.map((p) => p.id);
  const diagrams = await db
    .select({
      id: schema.diagram.id,
      projectId: schema.diagram.projectId,
      name: schema.diagram.name,
      type: schema.diagram.type,
      updatedAt: schema.diagram.updatedAt,
    })
    .from(schema.diagram)
    .where(inArray(schema.diagram.projectId, projectIds))
    .orderBy(asc(schema.diagram.name));

  const byProject = new Map<string, DiagramSummary[]>();
  for (const d of diagrams) {
    if (!d.projectId) continue; // personal diagrams aren't listed in the org dashboard
    const list = byProject.get(d.projectId) ?? [];
    list.push({ id: d.id, name: d.name, type: d.type, updatedAt: d.updatedAt.toISOString() });
    byProject.set(d.projectId, list);
  }

  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    updatedAt: p.updatedAt.toISOString(),
    diagrams: byProject.get(p.id) ?? [],
  }));
}

/* ---- Project CRUD ---- */

export async function createProject(workspaceId: string, name: string): Promise<{ id: string }> {
  const userId = await requireUserId();
  await requireWorkspaceRole(userId, workspaceId, "edit");
  const trimmed = name.trim() || "Untitled project";
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(schema.project).values({ id, workspaceId, name: trimmed });
    await tx
      .insert(schema.projectMember)
      .values({ id: randomUUID(), projectId: id, userId, role: "owner" });
  });
  revalidatePath("/");
  return { id };
}

export async function renameProject(projectId: string, name: string): Promise<void> {
  const userId = await requireUserId();
  const workspaceId = await assertProjectAccess(userId, projectId);
  await requireWorkspaceRole(userId, workspaceId, "edit");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  await db
    .update(schema.project)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(eq(schema.project.id, projectId));
  revalidatePath("/");
}

export async function deleteProject(projectId: string): Promise<void> {
  const userId = await requireUserId();
  const workspaceId = await assertProjectAccess(userId, projectId);
  await requireWorkspaceRole(userId, workspaceId, "edit");
  // Diagrams/versions cascade via FK onDelete: "cascade".
  await db.delete(schema.project).where(eq(schema.project.id, projectId));
  revalidatePath("/");
}

/* ---- Diagram CRUD ---- */

export async function createDiagram(
  projectId: string,
  kind: DiagramKind = "bpmn",
  name?: string,
  /**
   * Optional starter content. When provided (e.g. an imported `.bpmn` file or
   * AI-generated XML), the diagram is seeded with it verbatim instead of the
   * kind's default seed. Callers that omit it keep the existing behaviour.
   */
  content?: string,
): Promise<{ id: string }> {
  const userId = await requireUserId();
  const workspaceId = await assertProjectAccess(userId, projectId);
  await requireWorkspaceRole(userId, workspaceId, "edit");
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(schema.diagram).values({
      id,
      projectId,
      type: kind,
      name: name?.trim() || defaultNameForKind(kind),
      content: content ?? seedForKind(kind),
    });
    await tx
      .update(schema.project)
      .set({ updatedAt: new Date() })
      .where(eq(schema.project.id, projectId));
  });
  revalidatePath("/");
  return { id };
}

export async function renameDiagram(diagramId: string, name: string): Promise<void> {
  const userId = await requireUserId();
  const access = await assertDiagramAccess(userId, diagramId);
  // Personal diagrams stay owner-only; org diagrams require workspace edit.
  if (access.kind === "org") {
    await requireWorkspaceRole(userId, access.workspaceId, "edit");
  }
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  await db
    .update(schema.diagram)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(eq(schema.diagram.id, diagramId));
  revalidatePath("/");
}

export async function deleteDiagram(diagramId: string): Promise<void> {
  const userId = await requireUserId();
  const access = await assertDiagramAccess(userId, diagramId);
  if (access.kind === "org") {
    await requireWorkspaceRole(userId, access.workspaceId, "edit");
  }
  await db.delete(schema.diagram).where(eq(schema.diagram.id, diagramId));
  revalidatePath("/");
}

export interface LoadedDiagram {
  id: string;
  name: string;
  kind: DiagramKind;
  content: string;
}

/** Load a single diagram for the workbench, authorized for the current user. */
export async function getDiagram(diagramId: string): Promise<LoadedDiagram | null> {
  const userId = await requireUserId();
  try {
    await assertDiagramAccess(userId, diagramId);
  } catch {
    return null;
  }
  const rows = await db
    .select({
      id: schema.diagram.id,
      name: schema.diagram.name,
      kind: schema.diagram.type,
      content: schema.diagram.content,
    })
    .from(schema.diagram)
    .where(eq(schema.diagram.id, diagramId))
    .limit(1);
  return rows[0] ?? null;
}
