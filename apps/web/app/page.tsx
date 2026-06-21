import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getActiveContext } from "@/lib/context";
import { listProjects } from "@/lib/diagram-actions";
import { listPersonalProjects } from "@/lib/personal-actions";
import { getAiConfig } from "@/lib/ai";
import { Dashboard } from "@/components/dashboard";
import { Landing } from "@/components/marketing/landing";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return <Landing />;
  }

  // Scope the dashboard to the active context: an active org reads org projects,
  // otherwise the personal scope.
  const ctx = await getActiveContext();
  const projects =
    ctx?.kind === "org" ? await listProjects() : await listPersonalProjects();

  // Gate the "Generate with AI" creation mode on a configured provider, resolved
  // for the active scope (org -> decrypted BYOK config, or personal).
  const aiConnected = ctx ? Boolean(await getAiConfig(ctx)) : false;

  return (
    <Dashboard
      userName={session.user.name}
      userEmail={session.user.email}
      projects={projects}
      aiConnected={aiConnected}
      context={ctx?.kind ?? "personal"}
    />
  );
}
