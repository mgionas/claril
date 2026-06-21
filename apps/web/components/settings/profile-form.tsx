"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsCard, SettingsHeader, StatusBanner, type Status } from "./settings-ui";

interface ProfileInitial {
  name: string;
  email: string;
  image: string;
}

export function ProfileForm({ initial }: { initial: ProfileInitial }) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [image, setImage] = useState(initial.image);
  const [status, setStatus] = useState<Status>(null);
  const [pending, setPending] = useState(false);

  const dirty = name.trim() !== initial.name || image.trim() !== initial.image;
  const valid = name.trim().length > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || pending) return;
    setPending(true);
    setStatus(null);
    try {
      const { error } = await authClient.updateUser({
        name: name.trim(),
        image: image.trim() || undefined,
      });
      if (error) {
        setStatus({ kind: "error", message: error.message ?? "Could not save your profile." });
      } else {
        setStatus({ kind: "success", message: "Profile updated." });
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
      <SettingsHeader title="Profile" description="How you appear across Claril." />

      <form onSubmit={onSubmit}>
        <SettingsCard>
          <div className="grid gap-2">
            <Label htmlFor="profile-name">Display name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ada Lovelace"
              autoComplete="name"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="profile-image">Avatar URL</Label>
            <Input
              id="profile-image"
              type="url"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="https://example.com/avatar.png"
              autoComplete="off"
            />
            <p className="text-xs text-fg-subtle">
              Optional. A square image works best.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" value={initial.email} readOnly disabled />
            <p className="text-xs text-fg-subtle">
              Your email is used to sign in and can&apos;t be changed here.
            </p>
          </div>
        </SettingsCard>

        <StatusBanner status={status} />

        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={!dirty || !valid || pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
