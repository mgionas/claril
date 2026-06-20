import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAiConfigForSettings } from "@/lib/actions";
import { AiSettingsForm } from "@/components/ai/ai-settings-form";

/**
 * Org AI settings — view/update provider, model, base URL and key. BYOK; the
 * key is encrypted at rest and never sent to the client. Self-contained route.
 */
export default async function AiSettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/sign-in");
  }

  const config = await getAiConfigForSettings();

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <AiSettingsForm initial={config} />
    </main>
  );
}
