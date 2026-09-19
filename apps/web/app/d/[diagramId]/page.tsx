import { getCurrentSession } from "@/lib/session";
import { notFound, redirect } from "next/navigation";
import { getDiagram } from "@/lib/diagram-actions";
import { diagramContext, getAiConfigFor } from "@/lib/ai";
import { assertDiagramAccess, canDo, requireWorkspaceRole } from "@/lib/tenancy";
import { getDiagramDoc } from "@/lib/actions";
import { getChatMessages } from "@/lib/chat-actions";
import { Workbench } from "@/components/workbench";

export default async function DiagramPage({
  params,
  searchParams,
}: {
  params: Promise<{ diagramId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getCurrentSession();
  if (!session?.user) {
    redirect("/sign-in");
  }

  const { diagramId } = await params;
  const sp = await searchParams;
  const diagram = await getDiagram(diagramId);
  if (!diagram) {
    notFound();
  }

  // AI for an open diagram reflects THAT diagram's context: an org diagram uses
  // its org's AI, a personal diagram uses the user's personal AI.
  const { ctx } = await diagramContext(session.user.id, diagram.id);

  // Independent reads run together; the doc only when AI is configured.
  const [aiConfig, initialChatMessages, canResolveComments] = await Promise.all([
    getAiConfigFor(ctx),
    getChatMessages(diagram.id),
    resolveCanResolveComments(session.user.id, diagram.id, ctx.kind),
  ]);
  const initialDoc = aiConfig ? await getDiagramDoc(diagram.id) : null;

  const threadParam = sp.thread;
  const initialThreadId = Array.isArray(threadParam) ? threadParam[0] : threadParam;

  return (
    <Workbench
      diagramId={diagram.id}
      diagramName={diagram.name}
      kind={diagram.kind}
      initialContent={diagram.content}
      userName={session.user.name}
      currentUserId={session.user.id}
      aiConnected={Boolean(aiConfig)}
      aiProvider={aiConfig?.provider}
      diagramScope={ctx.kind}
      canResolveComments={canResolveComments}
      initialThreadId={initialThreadId}
      initialDoc={initialDoc}
      initialChatMessages={initialChatMessages}
    />
  );
}

/**
 * Comments are available in both scopes. On a personal diagram the solo owner
 * can resolve their own threads; on org diagrams editors+ can resolve any
 * thread (resolved from the viewer's workspace role). The server enforces both.
 */
async function resolveCanResolveComments(
  userId: string,
  diagramId: string,
  kind: "personal" | "org",
): Promise<boolean> {
  if (kind === "personal") return true;
  try {
    const access = await assertDiagramAccess(userId, diagramId);
    if (access.kind !== "org") return false;
    const role = await requireWorkspaceRole(userId, access.workspaceId, "view");
    return canDo(role, "edit");
  } catch {
    return false;
  }
}
