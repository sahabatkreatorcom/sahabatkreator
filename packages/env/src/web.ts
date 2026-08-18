import { loadRootEnv } from "./load";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// Single file of truth: baca .env dari root workspace.
loadRootEnv();

export const env = createEnv({
  client: {
    NEXT_PUBLIC_APP_URL: z
      .string()
      .url()
      .default("http://localhost:3000")
      .describe("Base URL publik aplikasi (dipakai auth client & sitemap)."),
  },
  runtimeEnv: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  emptyStringAsUndefined: true,
});
