import { resolve } from "node:path";
import { config } from "dotenv";

// Single source of truth: selalu load .env dari root monorepo
// (drizzle-kit dijalankan dengan cwd = packages/db, jadi ../../ = root)
config({ path: resolve(process.cwd(), "../../.env") });

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
});
