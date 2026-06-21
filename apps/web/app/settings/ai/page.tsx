import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUserOrgId } from "@/lib/ai";
import { getUsageSummary } from "@/lib/ai-usage";
import { AiConnectionsManager } from "@/components/ai/ai-connections-manager";
import { UsageSummary } from "@/components/ai/usage-summary";
import { SettingsHeader } from "@/components/settings/settings-ui";

/**
 * Org AI settings — multi-provider connections manager. Connect one or more
 * providers (BYOK, keys encrypted at rest, never sent to the client) and pick
 * the org-default model. Shows org-wide token usage by project and model.
 * Rendered inside the shared settings layout (AppShell + sub-nav).
 */
export default async function AiSettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in");

  const orgId = await getUserOrgId(session.user.id);
  const usage = orgId ? await getUsageSummary(orgId) : null;

  return (
    <div className="max-w-2xl">
      <SettingsHeader
        title="AI providers"
        description="Connect one or more providers, bring-your-own-key. Keys are stored encrypted per organization and never sent to the browser. Pick which model your org uses by default — Claril works fully without AI."
      />
      <AiConnectionsManager />
      <UsageSummary data={usage} />
    </div>
  );
}
