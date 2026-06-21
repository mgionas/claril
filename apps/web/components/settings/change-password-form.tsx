"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsCard, SettingsHeader, StatusBanner, type Status } from "./settings-ui";

const MIN_LENGTH = 8;

/**
 * Change-password card for the profile page. Uses Better Auth's
 * `changePassword` (email/password is enabled in `lib/auth`). Requires the
 * current password; optionally revokes other sessions so a compromised device
 * is signed out. The current session stays signed in.
 */
export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [status, setStatus] = useState<Status>(null);
  const [pending, setPending] = useState(false);

  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && next !== confirm;
  const valid =
    current.length > 0 && next.length >= MIN_LENGTH && next === confirm;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || pending) return;
    setPending(true);
    setStatus(null);
    try {
      const { error } = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: revokeOthers,
      });
      if (error) {
        setStatus({
          kind: "error",
          message: error.message ?? "Could not change your password.",
        });
      } else {
        setStatus({ kind: "success", message: "Password changed." });
        setCurrent("");
        setNext("");
        setConfirm("");
      }
    } catch {
      setStatus({ kind: "error", message: "Something went wrong. Please try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-10">
      <SettingsHeader
        title="Password"
        description="Change the password you use to sign in."
      />
      <SettingsCard>
        <div className="grid gap-2">
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            required
            aria-invalid={tooShort || undefined}
          />
          <p className="text-xs text-fg-subtle">
            {tooShort
              ? `Use at least ${MIN_LENGTH} characters.`
              : `At least ${MIN_LENGTH} characters.`}
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input
            id="confirm-password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            aria-invalid={mismatch || undefined}
          />
          {mismatch && (
            <p className="text-xs text-destructive">Passwords don&apos;t match.</p>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <input
            type="checkbox"
            className="size-4 rounded border-hairline accent-accent"
            checked={revokeOthers}
            onChange={(e) => setRevokeOthers(e.target.checked)}
          />
          Sign out of other devices
        </label>
      </SettingsCard>

      <StatusBanner status={status} />

      <div className="mt-4 flex justify-end">
        <Button type="submit" disabled={!valid || pending}>
          {pending ? "Changing…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}
