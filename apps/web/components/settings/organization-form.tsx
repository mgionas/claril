"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import type { OrgOverview } from "@/lib/org-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsCard, SettingsHeader, StatusBanner, type Status } from "./settings-ui";

const SLUG_RE = /^[a-z0-9-]+$/;

export function OrganizationForm({ overview }: { overview: OrgOverview }) {
  const router = useRouter();
  const canManage = overview.canManage;
  const [name, setName] = useState(overview.name);
  const [slug, setSlug] = useState(overview.slug);
  const [status, setStatus] = useState<Status>(null);
  const [pending, setPending] = useState(false);

  const trimmedName = name.trim();
  const trimmedSlug = slug.trim();
  const dirty = trimmedName !== overview.name || trimmedSlug !== overview.slug;
  const slugValid = SLUG_RE.test(trimmedSlug);
  const valid = trimmedName.length > 0 && slugValid;

  const created = new Date(overview.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage || !valid || !dirty || pending) return;
    setPending(true);
    setStatus(null);
    try {
      const { error } = await authClient.organization.update({
        organizationId: overview.id,
        data: { name: trimmedName, slug: trimmedSlug },
      });
      if (error) {
        setStatus({
          kind: "error",
          message: error.message ?? "Could not update the organization.",
        });
      } else {
        setStatus({ kind: "success", message: "Organization updated." });
        router.refresh();
      }
    } catch {
      setStatus({ kind: "error", message: "Something went wrong. Please try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <SettingsHeader
        title="Organization"
        description={
          canManage
            ? "Manage your organization's identity."
            : "Your organization. Only owners and admins can make changes."
        }
      />

      <form onSubmit={onSubmit}>
        <SettingsCard>
          <div className="grid gap-2">
            <Label htmlFor="org-name">Name</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canManage}
              readOnly={!canManage}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="org-slug">Slug</Label>
            <Input
              id="org-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              disabled={!canManage}
              readOnly={!canManage}
              aria-invalid={trimmedSlug.length > 0 && !slugValid}
              className="font-mono"
            />
            {trimmedSlug.length > 0 && !slugValid ? (
              <p className="text-xs text-error">
                Use lowercase letters, numbers and hyphens only.
              </p>
            ) : (
              <p className="text-xs text-fg-subtle">
                Lowercase letters, numbers and hyphens.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-hairline pt-4 text-sm">
            <div>
              <div className="text-fg-subtle">Created</div>
              <div className="mt-0.5 text-fg">{created}</div>
            </div>
            <div>
              <div className="text-fg-subtle">Members</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-fg">
                <Users className="size-3.5 text-fg-muted" />
                {overview.memberCount}
              </div>
            </div>
          </div>
        </SettingsCard>

        {canManage && (
          <>
            <StatusBanner status={status} />
            <div className="mt-4 flex justify-end">
              <Button type="submit" disabled={!dirty || !valid || pending}>
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
