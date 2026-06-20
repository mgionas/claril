import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listProjects, listArchivedDiagrams } from "@/lib/diagram-actions";
import { getOrgAiConfig, getUserOrgId } from "@/lib/ai";
import { Dashboard } from "@/components/dashboard";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/sign-in");
  }

  const [projects, archived] = await Promise.all([listProjects(), listArchivedDiagrams()]);

  // Gate the "Generate with AI" creation mode on a configured provider, the
  // same resolution the workbench uses (org -> decrypted BYOK config).
  const orgId = await getUserOrgId(session.user.id);
  const aiConnected = orgId ? Boolean(await getOrgAiConfig(orgId)) : false;

  return (
    <Dashboard
      userName={session.user.name}
      projects={projects}
      archived={archived}
      aiConnected={aiConnected}
    />
  );
}
