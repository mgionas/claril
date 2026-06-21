/**
 * W13 Phase 2 — legacy migration routine.
 *
 * Solo signup originally auto-created a "Personal" Organization (+ default
 * Workspace + Project) and made the user its Owner. The personal subsystem
 * replaces that chain with a flat, user-owned `personal_project → diagram`
 * structure plus user-scoped AI config (`user_ai_connection`/`user_ai_default`).
 *
 * This routine migrates each such auto-created org into the new model:
 *   1. For every project under the org's workspaces, create a `personal_project`
 *      owned by the org's owner and re-point that project's diagrams onto it
 *      (`personal_project_id` set, `project_id` null).
 *   2. Copy the org's `ai_connection` rows → `user_ai_connection` and its
 *      `ai_org_default` (if any) → `user_ai_default`, keyed by the owner.
 *   3. Delete the org — its FK cascade removes the workspace/project/members/
 *      ai_connection/ai_org_default rows.
 *
 * Orgs with more than one member (real teams) are left untouched. The routine is
 * idempotent: qualifying orgs are deleted, so a re-run is a no-op; the copies use
 * `onConflictDoNothing` on the user-scoped unique constraints to survive any
 * partial/duplicate state. Each org is migrated in a single transaction.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./client";
import {
  aiConnection,
  aiOrgDefault,
  diagram,
  personalProject,
  project,
  userAiConnection,
  userAiDefault,
  workspace,
} from "./schema/app";
import { member, organization } from "./schema/auth";

export interface OrgForCheck {
  name: string;
  members: { userId: string; role: string }[];
}

/**
 * A legacy auto-created personal org is one named exactly "Personal" with a
 * single member who is its owner. Anything else (renamed, multi-member, or a
 * lone non-owner member) is a real org and must be left alone.
 */
export function qualifiesAsAutoPersonalOrg(org: OrgForCheck): boolean {
  return org.name === "Personal" && org.members.length === 1 && org.members[0]?.role === "owner";
}

export async function migratePersonalOrgs(): Promise<{
  orgsMigrated: number;
  projectsMoved: number;
}> {
  const organizations = await db.select().from(organization);
  const members = await db.select().from(member);

  const membersByOrg = new Map<string, { userId: string; role: string }[]>();
  for (const m of members) {
    const list = membersByOrg.get(m.organizationId) ?? [];
    list.push({ userId: m.userId, role: m.role });
    membersByOrg.set(m.organizationId, list);
  }

  let orgsMigrated = 0;
  let projectsMoved = 0;

  for (const org of organizations) {
    const orgMembers = membersByOrg.get(org.id) ?? [];
    if (!qualifiesAsAutoPersonalOrg({ name: org.name, members: orgMembers })) continue;

    const ownerUserId = orgMembers[0]!.userId;

    const moved = await db.transaction(async (tx) => {
      // Re-assert the qualifier INSIDE the transaction before any mutation. The
      // outer snapshot was read non-transactionally; a member could have been
      // added since, turning this into a real team org. The org delete is
      // irreversible, so re-check live membership and skip (return null, no
      // mutations) if it no longer qualifies.
      const liveMembers = await tx
        .select({ userId: member.userId, role: member.role })
        .from(member)
        .where(eq(member.organizationId, org.id));
      if (!qualifiesAsAutoPersonalOrg({ name: org.name, members: liveMembers })) {
        return null;
      }

      let projectsMovedForOrg = 0;

      const workspaces = await tx
        .select()
        .from(workspace)
        .where(eq(workspace.organizationId, org.id));

      for (const ws of workspaces) {
        const projects = await tx.select().from(project).where(eq(project.workspaceId, ws.id));

        for (const proj of projects) {
          const personalProjectId = randomUUID();
          await tx.insert(personalProject).values({
            id: personalProjectId,
            ownerUserId,
            name: proj.name,
            description: proj.description,
            createdAt: proj.createdAt,
            updatedAt: proj.updatedAt,
          });

          await tx
            .update(diagram)
            .set({ personalProjectId, projectId: null })
            .where(eq(diagram.projectId, proj.id));

          projectsMovedForOrg += 1;
        }
      }

      // Copy org-scoped AI config to the owner's user-scoped tables.
      const connections = await tx
        .select()
        .from(aiConnection)
        .where(eq(aiConnection.organizationId, org.id));

      for (const conn of connections) {
        await tx
          .insert(userAiConnection)
          .values({
            id: randomUUID(),
            userId: ownerUserId,
            provider: conn.provider,
            encryptedKey: conn.encryptedKey,
            baseUrl: conn.baseUrl,
            defaultModel: conn.defaultModel,
          })
          .onConflictDoNothing({
            target: [userAiConnection.userId, userAiConnection.provider],
          });
      }

      const [orgDefault] = await tx
        .select()
        .from(aiOrgDefault)
        .where(eq(aiOrgDefault.organizationId, org.id));

      if (orgDefault) {
        await tx
          .insert(userAiDefault)
          .values({
            userId: ownerUserId,
            provider: orgDefault.provider,
            model: orgDefault.model,
          })
          .onConflictDoNothing({ target: userAiDefault.userId });
      }

      // Cascade removes workspace/project/members/ai_connection/ai_org_default.
      await tx.delete(organization).where(eq(organization.id, org.id));

      return projectsMovedForOrg;
    });

    if (moved === null) continue; // re-check inside the tx rejected it (now a real org)
    orgsMigrated += 1;
    projectsMoved += moved;
  }

  console.log(
    `[migrate-personal-orgs] migrated ${orgsMigrated} org(s), moved ${projectsMoved} project(s) to personal space`,
  );

  return { orgsMigrated, projectsMoved };
}

// Direct-run guard: execute only when this file is the entry point
// (`tsx src/migrate-personal-orgs.ts`), never on import. tsx sets
// `process.argv[1]` to this file's path; compare it against this module's URL.
const isDirectRun =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] != null &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isDirectRun) {
  migratePersonalOrgs()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[migrate-personal-orgs] failed:", err);
      process.exit(1);
    });
}
