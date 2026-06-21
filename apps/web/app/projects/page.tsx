import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getActiveContext } from "@/lib/context";
import { listProjects } from "@/lib/diagram-actions";
import { listPersonalProjects } from "@/lib/personal-actions";
import { getAiConfig } from "@/lib/ai";
import { Dashboard } from "@/components/dashboard";

export default async function ProjectsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/sign-in");
  }

  // Scope the listing to the active context: an active org reads org projects,
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
