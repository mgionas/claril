import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getActiveContext } from "@/lib/context";
import { getUsageSummary } from "@/lib/ai-usage";
import { AiConnectionsManager } from "@/components/ai/ai-connections-manager";
import { UsageSummary } from "@/components/ai/usage-summary";
import { SettingsHeader } from "@/components/settings/settings-ui";

/**
 * AI settings — multi-provider connections manager, context-aware. In an active
 * org it manages org-wide connections (BYOK, keys encrypted at rest) and shows
 * org token usage; in the personal scope it manages the user's own connections
 * (no usage panel). Rendered inside the shared settings layout (AppShell + sub-nav).
 */
export default async function AiSettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in");

  const ctx = await getActiveContext();
  if (ctx?.kind === "org") {
    const usage = await getUsageSummary(ctx.orgId);
    return (
      <div className="max-w-2xl">
        <SettingsHeader
          title="AI providers"
          description="Connect one or more providers, bring-your-own-key. Keys are stored encrypted per organization and never sent to the browser. Pick the model your org uses by default — Claril works fully without AI."
        />
        <AiConnectionsManager scope="org" />
        <UsageSummary data={usage} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <SettingsHeader
        title="AI providers"
        description="Connect your own providers, bring-your-own-key. Keys are stored encrypted for your account and never sent to the browser — used for your personal diagrams. Claril works fully without AI."
      />
      <AiConnectionsManager scope="personal" />
      <p className="mt-6 text-xs text-fg-subtle">AI usage is tracked per organization.</p>
    </div>
  );
}
