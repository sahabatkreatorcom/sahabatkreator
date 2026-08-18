import { loadRootEnv } from "@sahabat-kreator/env/load";
import { defineConfig } from "drizzle-kit";

// Single file of truth: baca .env dari root workspace.
loadRootEnv();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL tidak ditemukan. Isi .env di root workspace (lihat .env.example) sebelum menjalankan Drizzle tooling.",
  );
}

export default defineConfig({
  schema: "./src/schema",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
    ssl: process.env.DATABASE_SSL === "true",
  },
});
