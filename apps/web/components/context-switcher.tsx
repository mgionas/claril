"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronsUpDown, Loader2, Plus, User } from "lucide-react";
import { authClient, useSession } from "@/lib/auth-client";
import { createOrgWithWorkspace } from "@/lib/org-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const inputClass =
  "w-full rounded-[6px] border border-hairline bg-elevated px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-accent";

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return "Something went wrong. Please try again.";
}

/**
 * Top-left scope switcher: flips the session between the personal scope and any
 * organization the user belongs to, and offers a quick create-organization
 * flow. Reads orgs + the active org id from Better Auth's client hooks so it
 * stays self-contained; mutations go through `setActive` (org id, or `null` to
 * return to personal) followed by a router refresh so server components re-read
 * the new scope.
 */
export function ContextSwitcher() {
  const router = useRouter();
  const { data: orgs } = authClient.useListOrganizations();
  const { data: session } = useSession();
  const activeOrgId = session?.session?.activeOrganizationId ?? null;

  const [switching, startSwitch] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);

  const activeOrg = orgs?.find((o) => o.id === activeOrgId) ?? null;
  const isPersonal = !activeOrg;

  function switchToOrg(organizationId: string) {
    if (organizationId === activeOrgId || switching) return;
    startSwitch(async () => {
      // better-auth client methods resolve to { data, error } (they don't throw);
      // only refresh on success so a failed switch doesn't show the wrong scope.
      const { error } = await authClient.organization.setActive({ organizationId });
      if (error) return;
      router.refresh();
    });
  }

  function switchToPersonal() {
    if (isPersonal || switching) return;
    startSwitch(async () => {
      const { error } = await authClient.organization.setActive({ organizationId: null });
      if (error) return;
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex h-8 max-w-[12rem] shrink-0 items-center gap-1.5 rounded-[6px] border border-hairline bg-elevated/60 px-2 text-sm text-fg outline-none transition-colors hover:bg-elevated focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-60"
          aria-label="Switch context"
          disabled={switching}
        >
          {switching ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-fg-subtle" />
          ) : isPersonal ? (
            <User className="size-3.5 shrink-0 text-fg-subtle" />
          ) : (
            <Building2 className="size-3.5 shrink-0 text-fg-subtle" />
          )}
          <span className="truncate font-medium">
            {isPersonal ? "Personal" : activeOrg!.name}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-fg-subtle" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel className="text-xs font-normal text-fg-subtle">
            Switch context
          </DropdownMenuLabel>
          <DropdownMenuItem onSelect={switchToPersonal}>
            <User />
            <span className="flex-1 truncate">Personal</span>
            {isPersonal && <Check className="size-4 text-accent" />}
          </DropdownMenuItem>

          {orgs && orgs.length > 0 && <DropdownMenuSeparator />}
          {orgs?.map((org) => (
            <DropdownMenuItem key={org.id} onSelect={() => switchToOrg(org.id)}>
              <Building2 />
              <span className="flex-1 truncate">{org.name}</span>
              {org.id === activeOrgId && <Check className="size-4 text-accent" />}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <Plus />
            Create organization
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateOrgDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

function CreateOrgDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      try {
        const { id } = await createOrgWithWorkspace(trimmed);
        const { error: activeErr } = await authClient.organization.setActive({ organizationId: id });
        if (activeErr) {
          setError("Organization created, but switching to it failed. Pick it from the menu.");
          onOpenChange(false);
          router.refresh();
          return;
        }
        setName("");
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        setError(errorMessage(err));
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        if (!o) {
          setName("");
          setError(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="border-hairline bg-panel/95 text-fg backdrop-blur sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create organization</DialogTitle>
          <DialogDescription className="text-fg-muted">
            Organizations have their own projects, members, and AI settings. You become its owner.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-org-name" className="text-xs font-medium text-fg-subtle">
              Name
            </label>
            <input
              id="new-org-name"
              autoFocus
              className={inputClass}
              placeholder="e.g. Acme Inc."
              value={name}
              disabled={pending}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Create organization
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
