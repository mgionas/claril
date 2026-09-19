import { getOrgOverview } from "@/lib/org-actions";
import { OrganizationForm } from "@/components/settings/organization-form";
import { SettingsHeader } from "@/components/settings/settings-ui";

/** Organization settings — name/slug (admin-gated), created date, member count. */
export default async function OrganizationSettingsPage() {
  const overview = await getOrgOverview();

  if (!overview) {
    return (
      <div className="max-w-2xl">
        <SettingsHeader title="Organization" />
        <p className="text-sm text-fg-muted">
          You don&apos;t belong to an organization yet.
        </p>
      </div>
    );
  }

  return <OrganizationForm overview={overview} />;
}
