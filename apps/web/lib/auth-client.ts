import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

/** Browser-side auth client. Same-origin, so no baseURL needed. */
export const authClient = createAuthClient({
  plugins: [organizationClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
