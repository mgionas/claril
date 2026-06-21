"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@claril/db";
import { auth } from "@/lib/auth";
import { notifyTargets } from "@/lib/mentions";
import { assertDiagramAccess, canDo, requireWorkspaceRole } from "@/lib/tenancy";

/**
 * Org-only, role-gated comment server actions (W16). Every action resolves the
 * target diagram through {@link orgDiagram}, which rejects personal diagrams and
 * yields the diagram's workspace for role gating. Notification fan-out is
 * best-effort (the gate is never swallowed).
 */

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  return session.user.id;
}

/** Resolve a diagram to its workspace, REQUIRING org scope. */
async function orgDiagram(userId: string, diagramId: string): Promise<{ workspaceId: string }> {
  const access = await assertDiagramAccess(userId, diagramId);
  if (access.kind !== "org") {
    throw new Error("Comments are only available on organization diagrams.");
  }
  return { workspaceId: access.workspaceId };
}

const bodySchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1, "Comment cannot be empty.").max(5000, "Comment is too long."));

const idListSchema = z.array(z.string()).default([]);

export interface CommentView {
  id: string;
  body: string;
  mentionedUserIds: string[];
  author: { id: string; name: string; image: string | null };
  createdAt: string;
  editedAt?: string | null;
}

export interface ThreadView {
  id: string;
  elementId: string | null;
  status: "open" | "resolved";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  resolvedBy?: string | null;
  comments: CommentView[];
}

export interface MentionableUser {
  id: string;
  name: string;
  image: string | null;
}

/** Load every thread for an org diagram, each with its ordered comments. */
export async function listThreads(diagramId: string): Promise<ThreadView[]> {
  const userId = await requireUserId();
  const { workspaceId } = await orgDiagram(userId, diagramId);
  await requireWorkspaceRole(userId, workspaceId, "view");

  const threads = await db
    .select()
    .from(schema.commentThread)
    .where(eq(schema.commentThread.diagramId, diagramId));

  if (threads.length === 0) return [];

  const threadIds = threads.map((t) => t.id);
  const commentRows = await db
    .select({
      id: schema.comment.id,
      threadId: schema.comment.threadId,
      body: schema.comment.body,
      mentionedUserIds: schema.comment.mentionedUserIds,
      createdAt: schema.comment.createdAt,
      editedAt: schema.comment.editedAt,
      authorId: schema.user.id,
      authorName: schema.user.name,
      authorImage: schema.user.image,
    })
    .from(schema.comment)
    .innerJoin(schema.user, eq(schema.user.id, schema.comment.createdBy))
    .where(inArray(schema.comment.threadId, threadIds))
    .orderBy(asc(schema.comment.createdAt));

  const byThread = new Map<string, CommentView[]>();
  for (const c of commentRows) {
    const list = byThread.get(c.threadId) ?? [];
    list.push({
      id: c.id,
      body: c.body,
      mentionedUserIds: (c.mentionedUserIds as string[] | null) ?? [],
      author: { id: c.authorId, name: c.authorName, image: c.authorImage },
      createdAt: c.createdAt.toISOString(),
      editedAt: c.editedAt ? c.editedAt.toISOString() : null,
    });
    byThread.set(c.threadId, list);
  }

  const views: ThreadView[] = threads.map((t) => ({
    id: t.id,
    elementId: t.elementId,
    status: t.status,
    createdBy: t.createdBy,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    resolvedBy: t.resolvedBy,
    comments: byThread.get(t.id) ?? [],
  }));

  // Open first, then most-recently-updated first.
  views.sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  return views;
}

/** Members who can be @mentioned: the diagram's workspace members + org owners/admins. */
export async function listMentionableUsers(diagramId: string): Promise<MentionableUser[]> {
  const userId = await requireUserId();
  const { workspaceId } = await orgDiagram(userId, diagramId);
  await requireWorkspaceRole(userId, workspaceId, "view");

  const ws = (
    await db
      .select({ orgId: schema.workspace.organizationId })
      .from(schema.workspace)
      .where(eq(schema.workspace.id, workspaceId))
      .limit(1)
  )[0];
  if (!ws) throw new Error("Not found");

  const wsMembers = await db
    .select({ id: schema.user.id, name: schema.user.name, image: schema.user.image })
    .from(schema.workspaceMember)
    .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMember.userId))
    .where(eq(schema.workspaceMember.workspaceId, workspaceId));

  const orgAdmins = await db
    .select({ id: schema.user.id, name: schema.user.name, image: schema.user.image })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .where(
      and(
        eq(schema.member.organizationId, ws.orgId),
        inArray(schema.member.role, ["owner", "admin"]),
      ),
    );

  const byId = new Map<string, MentionableUser>();
  for (const u of [...wsMembers, ...orgAdmins]) {
    if (!byId.has(u.id)) byId.set(u.id, { id: u.id, name: u.name, image: u.image });
  }
  return [...byId.values()];
}

/** Insert notification rows; best-effort (table may be absent pre-migration). */
async function fanOut(args: {
  recipients: { userId: string; type: "mention" | "reply" | "resolved" }[];
  actorId: string;
  diagramId: string;
  threadId: string;
  commentId: string | null;
}): Promise<void> {
  if (args.recipients.length === 0) return;
  try {
    await db.insert(schema.notification).values(
      args.recipients.map((r) => ({
        id: randomUUID(),
        userId: r.userId,
        type: r.type,
        diagramId: args.diagramId,
        threadId: args.threadId,
        commentId: args.commentId,
        actorId: args.actorId,
      })),
    );
  } catch {
    /* notifications are best-effort */
  }
}

/** Create a new thread (viewers allowed) with its first comment. */
export async function createThread(input: {
  diagramId: string;
  elementId?: string | null;
  body: string;
  mentionedUserIds?: string[];
}): Promise<{ threadId: string }> {
  const userId = await requireUserId();
  const { workspaceId } = await orgDiagram(userId, input.diagramId);
  await requireWorkspaceRole(userId, workspaceId, "view");

  const body = bodySchema.parse(input.body);
  const mentionedUserIds = idListSchema.parse(input.mentionedUserIds ?? []);

  const threadId = randomUUID();
  const commentId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(schema.commentThread).values({
      id: threadId,
      diagramId: input.diagramId,
      elementId: input.elementId ?? null,
      status: "open",
      createdBy: userId,
    });
    await tx.insert(schema.comment).values({
      id: commentId,
      threadId,
      body,
      mentionedUserIds,
      createdBy: userId,
    });
  });

  const targets = notifyTargets({ actorId: userId, mentionedUserIds, participantIds: [userId] });
  await fanOut({
    recipients: targets.mention.map((uid) => ({ userId: uid, type: "mention" as const })),
    actorId: userId,
    diagramId: input.diagramId,
    threadId,
    commentId,
  });

  return { threadId };
}

/** Reply to an existing thread (viewers allowed). */
export async function addComment(input: {
  threadId: string;
  body: string;
  mentionedUserIds?: string[];
}): Promise<{ commentId: string }> {
  const userId = await requireUserId();

  const thread = (
    await db
      .select()
      .from(schema.commentThread)
      .where(eq(schema.commentThread.id, input.threadId))
      .limit(1)
  )[0];
  if (!thread) throw new Error("Not found");

  const { workspaceId } = await orgDiagram(userId, thread.diagramId);
  await requireWorkspaceRole(userId, workspaceId, "view");

  const body = bodySchema.parse(input.body);
  const mentionedUserIds = idListSchema.parse(input.mentionedUserIds ?? []);

  const commentId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(schema.comment).values({
      id: commentId,
      threadId: input.threadId,
      body,
      mentionedUserIds,
      createdBy: userId,
    });
    await tx
      .update(schema.commentThread)
      .set({ updatedAt: new Date() })
      .where(eq(schema.commentThread.id, input.threadId));
  });

  // Distinct participants (everyone who has commented on the thread).
  const participantRows = await db
    .selectDistinct({ createdBy: schema.comment.createdBy })
    .from(schema.comment)
    .where(eq(schema.comment.threadId, input.threadId));
  const participantIds = participantRows.map((r) => r.createdBy);

  const targets = notifyTargets({ actorId: userId, mentionedUserIds, participantIds });
  await fanOut({
    recipients: [
      ...targets.mention.map((uid) => ({ userId: uid, type: "mention" as const })),
      ...targets.reply.map((uid) => ({ userId: uid, type: "reply" as const })),
    ],
    actorId: userId,
    diagramId: thread.diagramId,
    threadId: input.threadId,
    commentId,
  });

  return { commentId };
}

/** Load a thread + its workspace, gating that the caller may resolve/reopen it. */
async function loadThreadForResolve(userId: string, threadId: string) {
  const thread = (
    await db
      .select()
      .from(schema.commentThread)
      .where(eq(schema.commentThread.id, threadId))
      .limit(1)
  )[0];
  if (!thread) throw new Error("Not found");
  const { workspaceId } = await orgDiagram(userId, thread.diagramId);
  const role = await requireWorkspaceRole(userId, workspaceId, "view");
  const allowed = thread.createdBy === userId || canDo(role, "edit");
  if (!allowed) throw new Error("Forbidden");
  return thread;
}

export async function resolveThread(threadId: string): Promise<void> {
  const userId = await requireUserId();
  const thread = await loadThreadForResolve(userId, threadId);

  await db
    .update(schema.commentThread)
    .set({ status: "resolved", resolvedBy: userId, resolvedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.commentThread.id, threadId));

  const participantRows = await db
    .selectDistinct({ createdBy: schema.comment.createdBy })
    .from(schema.comment)
    .where(eq(schema.comment.threadId, threadId));
  const recipients = participantRows
    .map((r) => r.createdBy)
    .filter((uid) => uid !== userId)
    .map((uid) => ({ userId: uid, type: "resolved" as const }));

  await fanOut({
    recipients,
    actorId: userId,
    diagramId: thread.diagramId,
    threadId,
    commentId: null,
  });
}

export async function reopenThread(threadId: string): Promise<void> {
  const userId = await requireUserId();
  await loadThreadForResolve(userId, threadId);
  await db
    .update(schema.commentThread)
    .set({ status: "open", resolvedBy: null, resolvedAt: null, updatedAt: new Date() })
    .where(eq(schema.commentThread.id, threadId));
}

/** Load a comment joined to its thread (for edit/delete gating). */
async function loadCommentWithThread(commentId: string) {
  const row = (
    await db
      .select({
        commentId: schema.comment.id,
        commentCreatedBy: schema.comment.createdBy,
        threadId: schema.commentThread.id,
        diagramId: schema.commentThread.diagramId,
      })
      .from(schema.comment)
      .innerJoin(schema.commentThread, eq(schema.commentThread.id, schema.comment.threadId))
      .where(eq(schema.comment.id, commentId))
      .limit(1)
  )[0];
  if (!row) throw new Error("Not found");
  return row;
}

/** Edit a comment (author only). No new notifications. */
export async function editComment(input: {
  commentId: string;
  body: string;
  mentionedUserIds?: string[];
}): Promise<void> {
  const userId = await requireUserId();
  const row = await loadCommentWithThread(input.commentId);
  await orgDiagram(userId, row.diagramId);
  if (row.commentCreatedBy !== userId) throw new Error("Forbidden");

  const body = bodySchema.parse(input.body);
  const mentionedUserIds = idListSchema.parse(input.mentionedUserIds ?? []);

  await db
    .update(schema.comment)
    .set({ body, mentionedUserIds, editedAt: new Date() })
    .where(eq(schema.comment.id, input.commentId));
}

/** Delete a comment (author or org admin). Removes the thread if it was the last comment. */
export async function deleteComment(commentId: string): Promise<void> {
  const userId = await requireUserId();
  const row = await loadCommentWithThread(commentId);
  const { workspaceId } = await orgDiagram(userId, row.diagramId);

  const role = await requireWorkspaceRole(userId, workspaceId, "view");
  const isOrgAdmin = role === "admin";
  if (row.commentCreatedBy !== userId && !isOrgAdmin) throw new Error("Forbidden");

  await db.delete(schema.comment).where(eq(schema.comment.id, commentId));

  const remaining = await db
    .select({ id: schema.comment.id })
    .from(schema.comment)
    .where(eq(schema.comment.threadId, row.threadId))
    .limit(1);
  if (!remaining[0]) {
    await db.delete(schema.commentThread).where(eq(schema.commentThread.id, row.threadId));
  }
}
