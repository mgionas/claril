import { getMembersView } from "@/lib/org-actions";
import { MembersManager } from "@/components/settings/members-manager";
import { SettingsHeader } from "@/components/settings/settings-ui";

/** Team management — members, roles, and pending invitations for the active org. */
export default async function MembersSettingsPage() {
  const view = await getMembersView();

  if (!view) {
    return (
      <div className="max-w-3xl">
        <SettingsHeader title="Members" />
        <p className="text-sm text-fg-muted">
          You don&apos;t belong to an organization yet.
        </p>
      </div>
    );
  }

  return <MembersManager view={view} />;
}
