import { createAuthClient } from "better-auth/client";
import { organizationClient, adminClient, twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  plugins: [
    organizationClient({ teams: { enabled: true } }),
    adminClient(),
    twoFactorClient({
      twoFactorPage: "/verify-2fa",
    }),
  ],
});

export const {
  signIn, signUp, signOut, useSession,
  organization, admin, twoFactor,
  sendVerificationEmail, requestPasswordReset, resetPassword,
} = authClient;
