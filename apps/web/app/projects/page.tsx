import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getActiveContext } from "@/lib/context";
import { listPersonalProjects } from "@/lib/personal-actions";
import { getAiConfig } from "@/lib/ai";
import { AppShell } from "@/components/app-shell";
import { ProjectsList } from "@/components/projects-list";

export default async function ProjectsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/sign-in");
  }

  // Org projects now live under per-workspace routes (`/w/[id]`); the flat
  // org `/projects` listing is superseded. Stopgap until Task 3 finalizes the
  // workspace pages: send org users to the dashboard (workspace overview).
  const ctx = await getActiveContext();
  if (ctx?.kind === "org") {
    redirect("/");
  }

  // Personal scope keeps the flat projects listing.
  const projects = await listPersonalProjects();

  // Gate the "Generate with AI" creation mode on a configured provider, resolved
  // for the active scope (personal here).
  const aiConnected = ctx ? Boolean(await getAiConfig(ctx)) : false;

  return (
    <AppShell userName={session.user.name} userEmail={session.user.email} title="Projects">
      <ProjectsList projects={projects} aiConnected={aiConnected} context="personal" />
    </AppShell>
  );
}
