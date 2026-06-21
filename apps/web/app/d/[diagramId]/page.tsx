import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDiagram } from "@/lib/diagram-actions";
import { diagramContext, getAiConfig } from "@/lib/ai";
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
  const session = await auth.api.getSession({ headers: await headers() });
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
  const aiConfig = await getAiConfig(ctx);
  const initialDoc = aiConfig ? await getDiagramDoc(diagram.id) : null;
  const initialChatMessages = await getChatMessages(diagram.id);

  // Comments are org-only. For org diagrams, resolve the viewer's workspace role
  // so editors+ can resolve any thread (the server still enforces this).
  let canResolveComments = false;
  if (ctx.kind === "org") {
    try {
      const access = await assertDiagramAccess(session.user.id, diagram.id);
      if (access.kind === "org") {
        const role = await requireWorkspaceRole(session.user.id, access.workspaceId, "view");
        canResolveComments = canDo(role, "edit");
      }
    } catch {
      canResolveComments = false;
    }
  }

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
