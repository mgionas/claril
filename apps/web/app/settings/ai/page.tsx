import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAiConfigForSettings } from "@/lib/actions";
import { getUserOrgId } from "@/lib/ai";
import { getUsageSummary } from "@/lib/ai-usage";
import { AiSettingsForm } from "@/components/ai/ai-settings-form";
import { UsageSummary } from "@/components/ai/usage-summary";

/**
 * Org AI settings — view/update provider, model, base URL and key. BYOK; the
 * key is encrypted at rest and never sent to the client. Shows org-wide token
 * usage broken down by project and model. Self-contained route.
 */
export default async function AiSettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/sign-in");
  }

  const config = await getAiConfigForSettings();
  const orgId = await getUserOrgId(session.user.id);
  const usage = orgId ? await getUsageSummary(orgId) : null;

  return (
    <div className="max-w-2xl">
      <AiSettingsForm initial={config} />
      <UsageSummary data={usage} />
    </div>
  );
}
