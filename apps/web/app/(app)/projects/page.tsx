import { getCurrentSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { getActiveContext } from "@/lib/context";
import { listPersonalProjects } from "@/lib/personal-actions";
import { getAiConfigFor } from "@/lib/ai";
import { ProjectsList } from "@/components/projects-list";

export default async function ProjectsPage() {
  const session = await getCurrentSession();
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
  // Gate the "Generate with AI" creation mode on a configured provider, resolved
  // for the active scope (personal here).
  const [projects, aiConfig] = await Promise.all([
    listPersonalProjects(),
    ctx ? getAiConfigFor(ctx) : Promise.resolve(null),
  ]);
  const aiConnected = Boolean(aiConfig);

  return (
    <>
      <ProjectsList projects={projects} aiConnected={aiConnected} context="personal" />
    </>
  );
}
