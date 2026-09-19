import { redirect } from "next/navigation";

/** /settings has no content of its own — land on the Profile page. */
export default function SettingsIndexPage() {
  redirect("/settings/profile");
}
