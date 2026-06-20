import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getOrCreateUserDiagram } from "@/lib/data";
import { Workbench } from "@/components/workbench";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/sign-in");
  }

  const diagram = await getOrCreateUserDiagram(session.user.id);

  return (
    <Workbench
      diagramId={diagram.id}
      diagramName={diagram.name}
      initialXml={diagram.content}
      userName={session.user.name}
    />
  );
}
