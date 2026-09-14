// Reset schema DB dev — drop semua lalu buat ulang dari schema drizzle.
// Aman dijalankan saat development (belum ada data penting).

import { resolve } from "node:path";
import { config } from "dotenv";
import pg from "pg";

config({ path: resolve(process.cwd(), "../../.env") });

const main = async () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("drop schema public cascade; create schema public;");
  console.log("Schema public di-drop dan dibuat ulang.");
  await client.end();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
