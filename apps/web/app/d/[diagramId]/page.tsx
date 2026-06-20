import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDiagram } from "@/lib/diagram-actions";
import { getOrgAiConfig, getUserOrgId } from "@/lib/ai";
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

  const orgId = await getUserOrgId(session.user.id);
  const aiConfig = orgId ? await getOrgAiConfig(orgId) : null;

  return (
    <Workbench
      diagramId={diagram.id}
      diagramName={diagram.name}
      initialXml={diagram.content}
      userName={session.user.name}
      aiConnected={Boolean(aiConfig)}
      aiProvider={aiConfig?.provider}
    />
  );
}
