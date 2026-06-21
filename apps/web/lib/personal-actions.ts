"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@claril/db";
import { requireUserId } from "@/lib/session";
import { assertPersonalProjectAccess } from "@/lib/tenancy";
import { defaultNameForKind, seedForKind, type DiagramKind } from "@/lib/default-diagram";
import type { ProjectWithDiagrams, DiagramSummary } from "@/lib/diagram-actions";

export async function listPersonalProjects(): Promise<ProjectWithDiagrams[]> {
  const userId = await requireUserId();
  const projects = await db
    .select()
    .from(schema.personalProject)
    .where(eq(schema.personalProject.ownerUserId, userId))
    .orderBy(desc(schema.personalProject.updatedAt));
  if (projects.length === 0) return [];
  const ids = projects.map((p) => p.id);
  const diagrams = await db
    .select({
      id: schema.diagram.id,
      personalProjectId: schema.diagram.personalProjectId,
      name: schema.diagram.name,
      type: schema.diagram.type,
      updatedAt: schema.diagram.updatedAt,
    })
    .from(schema.diagram)
    .where(inArray(schema.diagram.personalProjectId, ids))
    .orderBy(asc(schema.diagram.name));
  const byProject = new Map<string, DiagramSummary[]>();
  for (const d of diagrams) {
    if (!d.personalProjectId) continue;
    const list = byProject.get(d.personalProjectId) ?? [];
    list.push({ id: d.id, name: d.name, type: d.type, updatedAt: d.updatedAt.toISOString() });
    byProject.set(d.personalProjectId, list);
  }
  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    updatedAt: p.updatedAt.toISOString(),
    diagrams: byProject.get(p.id) ?? [],
  }));
}

export async function createPersonalProject(name: string): Promise<{ id: string }> {
  const userId = await requireUserId();
  const id = randomUUID();
  await db
    .insert(schema.personalProject)
    .values({ id, ownerUserId: userId, name: name.trim() || "Untitled project" });
  revalidatePath("/");
  return { id };
}

export async function renamePersonalProject(personalProjectId: string, name: string): Promise<void> {
  const userId = await requireUserId();
  await assertPersonalProjectAccess(userId, personalProjectId);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  await db
    .update(schema.personalProject)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(eq(schema.personalProject.id, personalProjectId));
  revalidatePath("/");
}

export async function deletePersonalProject(personalProjectId: string): Promise<void> {
  const userId = await requireUserId();
  await assertPersonalProjectAccess(userId, personalProjectId);
  await db.delete(schema.personalProject).where(eq(schema.personalProject.id, personalProjectId));
  revalidatePath("/");
}

export async function createPersonalDiagram(
  personalProjectId: string,
  kind: DiagramKind = "bpmn",
  name?: string,
  content?: string,
): Promise<{ id: string }> {
  const userId = await requireUserId();
  await assertPersonalProjectAccess(userId, personalProjectId);
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(schema.diagram).values({
      id,
      personalProjectId,
      type: kind,
      name: name?.trim() || defaultNameForKind(kind),
      content: content ?? seedForKind(kind),
    });
    await tx
      .update(schema.personalProject)
      .set({ updatedAt: new Date() })
      .where(eq(schema.personalProject.id, personalProjectId));
  });
  revalidatePath("/");
  return { id };
}
