import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { getUserOrgId } from "@/lib/ai";
import { getUsageSummary } from "@/lib/ai-usage";
import { AiConnectionsManager } from "@/components/ai/ai-connections-manager";
import { UsageSummary } from "@/components/ai/usage-summary";

/**
 * Org AI settings — multi-provider connections manager. Connect one or more
 * providers (BYOK, keys encrypted at rest, never sent to the client) and pick
 * the org-default model. Shows org-wide token usage by project and model.
 */
export default async function AiSettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/sign-in");
  }

  const orgId = await getUserOrgId(session.user.id);
  const usage = orgId ? await getUsageSummary(orgId) : null;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-xs text-fg-subtle transition-colors hover:text-fg-muted"
      >
        <ArrowLeft className="size-3.5" /> Back
      </Link>

      <h1 className="text-lg font-medium">AI providers</h1>
      <p className="mt-1 text-sm text-fg-muted">
        Connect one or more providers, bring-your-own-key. Keys are stored encrypted per
        organization and never sent to the browser. Pick which model your org uses by default.
        Claril works fully without AI.
      </p>

      <AiConnectionsManager />
      <UsageSummary data={usage} />
    </main>
  );
}
