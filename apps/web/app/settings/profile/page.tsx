import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ProfileForm } from "@/components/settings/profile-form";

/**
 * Account profile — edit display name and avatar URL; email is read-only
 * (Better Auth's change-email flow is verification-gated and not enabled here).
 */
export default async function ProfileSettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in");

  return (
    <ProfileForm
      initial={{
        name: session.user.name,
        email: session.user.email,
        image: session.user.image ?? "",
      }}
    />
  );
}
