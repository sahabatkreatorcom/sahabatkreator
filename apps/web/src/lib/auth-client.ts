import { env } from "@sahabatkreator/env/web";
import { adminClient, organizationClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // String kosong di dev → undefined → same-origin (via Vite proxy).
  baseURL: env.VITE_SERVER_URL || undefined,
  plugins: [
    organizationClient(),
    // Saat sign-in memerlukan verifikasi 2FA, plugin otomatis
    // redirect ke halaman ini (cara resmi better-auth).
    twoFactorClient({
      twoFactorPage: "/two-factor",
    }),
    adminClient(),
  ],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  twoFactor: twoFactorMethods,
  organization: orgMethods,
  admin: adminMethods,
} = authClient;
