import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listProjects } from "@/lib/diagram-actions";
import { Dashboard } from "@/components/dashboard";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/sign-in");
  }

  const projects = await listProjects();

  return <Dashboard userName={session.user.name} projects={projects} />;
}
