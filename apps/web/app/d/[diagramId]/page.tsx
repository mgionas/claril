import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDiagram } from "@/lib/diagram-actions";
import { diagramContext, getAiConfig } from "@/lib/ai";
import { getDiagramDoc } from "@/lib/actions";
import { getChatMessages } from "@/lib/chat-actions";
import { Workbench } from "@/components/workbench";

export default async function DiagramPage({
  params,
}: {
  params: Promise<{ diagramId: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/sign-in");
  }

  const { diagramId } = await params;
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

  return (
    <Workbench
      diagramId={diagram.id}
      diagramName={diagram.name}
      kind={diagram.kind}
      initialContent={diagram.content}
      userName={session.user.name}
      aiConnected={Boolean(aiConfig)}
      aiProvider={aiConfig?.provider}
      initialDoc={initialDoc}
      initialChatMessages={initialChatMessages}
    />
  );
}
