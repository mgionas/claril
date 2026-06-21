"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Check,
  ChevronsUpDown,
  Loader2,
  Plus,
  UserRound,
} from "lucide-react";
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
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

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
  const { isMobile } = useSidebar();
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

  // Active-context label: Personal space vs the active org name.
  const label = isPersonal ? "Personal" : activeOrg!.name;
  const subtitle = isPersonal ? "Personal space" : "Organization";

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                tooltip={label}
                aria-label="Switch context"
                disabled={switching}
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  {switching ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : isPersonal ? (
                    <UserRound className="size-4" />
                  ) : (
                    <Building2 className="size-4" />
                  )}
                </span>
                <span className="flex min-w-0 flex-col text-left leading-tight">
                  <span className="truncate text-sm font-semibold">{label}</span>
                  <span className="truncate text-xs text-sidebar-foreground/60">
                    {subtitle}
                  </span>
                </span>
                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              side={isMobile ? "bottom" : "right"}
              sideOffset={4}
              className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
            >
              <DropdownMenuLabel className="text-xs font-normal text-fg-subtle">
                Contexts
              </DropdownMenuLabel>
              <DropdownMenuItem className="gap-2 p-2" onSelect={switchToPersonal}>
                <span className="flex size-6 items-center justify-center rounded-md border border-hairline bg-elevated">
                  <UserRound className="size-3.5 shrink-0" />
                </span>
                <span className="flex-1 truncate">Personal</span>
                {isPersonal && <Check className="size-4 text-accent" />}
              </DropdownMenuItem>

              {orgs && orgs.length > 0 && <DropdownMenuSeparator />}
              {orgs?.map((org) => (
                <DropdownMenuItem
                  key={org.id}
                  className="gap-2 p-2"
                  onSelect={() => switchToOrg(org.id)}
                >
                  <span className="flex size-6 items-center justify-center rounded-md border border-hairline bg-elevated">
                    <Building2 className="size-3.5 shrink-0" />
                  </span>
                  <span className="flex-1 truncate">{org.name}</span>
                  {org.id === activeOrgId && <Check className="size-4 text-accent" />}
                </DropdownMenuItem>
              ))}

              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2 p-2" onSelect={() => setCreateOpen(true)}>
                <span className="flex size-6 items-center justify-center rounded-md border border-hairline bg-transparent">
                  <Plus className="size-3.5 shrink-0" />
                </span>
                <span className="text-fg-muted">Create organization</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

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
