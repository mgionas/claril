"use client";

import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Placeholder trigger for the workspace manage-members dialog. Task 4 (W13 P4)
 * replaces the click handler with the real members dialog; until then it is a
 * visible, inert affordance so the page layout/role-gating is in place.
 */
export function WorkspaceManageButton({ workspaceId }: { workspaceId: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void workspaceId}
      title="Manage members (coming soon)"
    >
      <Users className="size-4" />
      Manage
    </Button>
  );
}
