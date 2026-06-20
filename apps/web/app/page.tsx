import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getOrCreateUserDiagram } from "@/lib/data";
import { getOrgAiConfig, getUserOrgId } from "@/lib/ai";
import { Workbench } from "@/components/workbench";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/sign-in");
  }

  const diagram = await getOrCreateUserDiagram(session.user.id);

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
