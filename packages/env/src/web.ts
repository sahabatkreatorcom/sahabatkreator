import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// NOTE: This module is used on the CLIENT side. It must NOT import load.ts
// (which uses node:fs/node:path/node:url) or any other Node.js builtin,
// otherwise turbopack/webpack will fail when bundling this for the browser.
// The runtimeEnv object below is populated by Next.js from process.env,
// which is already loaded server-side by the API routes / server.ts.
export const env = createEnv({
  client: {
    NEXT_PUBLIC_APP_URL: z
      .string()
      .url()
      .default("http://localhost:3000")
      .describe("Base URL publik aplikasi (dipakai auth client & sitemap)."),
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: z
      .string()
      .optional()
      .describe("VAPID public key untuk push notification."),
  },
  runtimeEnv: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  },
  emptyStringAsUndefined: true,
});
