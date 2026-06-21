"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceManageDialog } from "@/components/workspace-manage-dialog";

/**
 * Top-bar trigger for the manage-workspace dialog (W13 P4). Rendered by the
 * workspace page only for managers (`canDo(role, "manage")`); the dialog itself
 * leans on the role-gated server actions as the real auth boundary.
 */
export function WorkspaceManageButton({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} title="Manage workspace">
        <Users className="size-4" />
        Manage
      </Button>
      <WorkspaceManageDialog
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
