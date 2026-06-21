import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { listProjects } from "@/lib/diagram-actions";
import { getOrgAiConfig, getUserOrgId } from "@/lib/ai";
import { Dashboard } from "@/components/dashboard";
import { Landing } from "@/components/marketing/landing";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return <Landing />;
  }

  const projects = await listProjects();

  // Gate the "Generate with AI" creation mode on a configured provider, the
  // same resolution the workbench uses (org -> decrypted BYOK config).
  const orgId = await getUserOrgId(session.user.id);
  const aiConnected = orgId ? Boolean(await getOrgAiConfig(orgId)) : false;

  return (
    <Dashboard userName={session.user.name} projects={projects} aiConnected={aiConnected} />
  );
}
