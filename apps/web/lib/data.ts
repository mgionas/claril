import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@claril/db";
import { defaultDiagram } from "@/lib/default-diagram";

export interface InitialDiagram {
  id: string;
  name: string;
  content: string;
}

/**
 * Ensure the user has a personal Org → Workspace → Project and at least one
 * diagram, creating them on first login. Idempotent. Returns the diagram to
 * open. (V1 picks the first workspace/project; richer selection comes later.)
 */
export async function getOrCreateUserDiagram(userId: string): Promise<InitialDiagram> {
  const memberships = await db
    .select()
    .from(schema.member)
    .where(eq(schema.member.userId, userId))
    .limit(1);

  let projectId: string;

  if (memberships.length === 0) {
    // Brand-new user: bootstrap the full tenancy chain.
    const orgId = randomUUID();
    const workspaceId = randomUUID();
    projectId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(schema.organization).values({
        id: orgId,
        name: "Personal",
        slug: `org-${randomUUID().slice(0, 8)}`,
      });
      await tx
        .insert(schema.member)
        .values({ id: randomUUID(), organizationId: orgId, userId, role: "owner" });
      await tx.insert(schema.workspace).values({
        id: workspaceId,
        organizationId: orgId,
        name: "My Workspace",
        slug: "default",
      });
      await tx
        .insert(schema.workspaceMember)
        .values({ id: randomUUID(), workspaceId, userId, role: "admin" });
      await tx
        .insert(schema.project)
        .values({ id: projectId, workspaceId, name: "My First Project" });
      await tx
        .insert(schema.projectMember)
        .values({ id: randomUUID(), projectId, userId, role: "owner" });
    });
  } else {
    const organizationId = memberships[0].organizationId;
    const workspaces = await db
      .select()
      .from(schema.workspace)
      .where(eq(schema.workspace.organizationId, organizationId))
      .limit(1);
    const workspaceId =
      workspaces[0]?.id ??
      (await (async () => {
        const id = randomUUID();
        await db
          .insert(schema.workspace)
          .values({ id, organizationId, name: "My Workspace", slug: "default" });
        await db
          .insert(schema.workspaceMember)
          .values({ id: randomUUID(), workspaceId: id, userId, role: "admin" });
        return id;
      })());

    const projects = await db
      .select()
      .from(schema.project)
      .where(eq(schema.project.workspaceId, workspaceId))
      .limit(1);
    projectId =
      projects[0]?.id ??
      (await (async () => {
        const id = randomUUID();
        await db.insert(schema.project).values({ id, workspaceId, name: "My First Project" });
        await db
          .insert(schema.projectMember)
          .values({ id: randomUUID(), projectId: id, userId, role: "owner" });
        return id;
      })());
  }

  const diagrams = await db
    .select()
    .from(schema.diagram)
    .where(eq(schema.diagram.projectId, projectId))
    .limit(1);

  if (diagrams[0]) {
    return { id: diagrams[0].id, name: diagrams[0].name, content: diagrams[0].content };
  }

  const diagramId = randomUUID();
  const name = "Untitled process";
  await db.insert(schema.diagram).values({
    id: diagramId,
    projectId,
    type: "bpmn",
    name,
    content: defaultDiagram,
  });
  return { id: diagramId, name, content: defaultDiagram };
}
