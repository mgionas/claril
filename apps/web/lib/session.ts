import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * The current session, looked up at most once per request (React `cache`) and
 * served from Better Auth's signed cookie cache when fresh. Every server-side
 * session read goes through here.
 */
export const getCurrentSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

/**
 * Resolve the current user id, or redirect to the sign-in page when there is no
 * valid session (e.g. it expired while a page was open). Redirecting — rather
 * than throwing — means an expired session bounces the user to login instead of
 * surfacing a raw "Unauthorized" error from a server action.
 *
 * IMPORTANT: redirect() throws the NEXT_REDIRECT control-flow signal — never
 * call this inside a try/catch that swallows errors, or the redirect is lost.
 */
export async function requireUserId(): Promise<string> {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/sign-in");
  return session.user.id;
}
