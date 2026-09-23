import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

type ImportMetaEnvRecord = Record<string, string | boolean | undefined>;

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    // Kosong di dev → request same-origin via Vite proxy (cookie auth selalu terkirim).
    // Production build: set URL API lengkap (mis. https://api.sahabatkreator.com).
    VITE_SERVER_URL: z.string().default(""),
    VITE_WEB_URL: z.url().default("http://localhost:5173"),
    // Google Analytics 4 Measurement ID (format G-XXXXXXX). Kosong → GA tidak dimuat.
    VITE_GA_MEASUREMENT_ID: z.string().optional(),
  },
  runtimeEnv: (import.meta as ImportMeta & { env: ImportMetaEnvRecord }).env,
  emptyStringAsUndefined: true,
});
