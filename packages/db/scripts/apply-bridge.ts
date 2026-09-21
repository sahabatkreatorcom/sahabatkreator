// Apply tabel bridge_config (konfigurasi Repliz bridge) ke DB live
// — raw SQL tanpa TTY (pattern sama dengan apply-listening.ts).

import { resolve } from "node:path";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { db } from "../src/index";

config({ path: resolve(process.cwd(), "../../.env") });

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "bridge_config" (
    "id" text PRIMARY KEY NOT NULL,
    "provider" text NOT NULL,
    "access_key" text NOT NULL,
    "secret_enc" text NOT NULL,
    "routing" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "bridge_config_provider_uidx" ON "bridge_config" ("provider")`,
];

async function main() {
  for (const stmt of STATEMENTS) {
    await db.execute(sql.raw(stmt));
    console.log("OK:", stmt.split("\n")[0]!.trim().slice(0, 80));
  }
  const r = await db.execute(
    sql.raw(
      `select table_name from information_schema.tables where table_schema='public' and table_name = 'bridge_config'`,
    ),
  );
  console.log(
    "Tabel bridge_config di DB:",
    (r.rows as { table_name: string }[]).map((x) => x.table_name).join(", "),
  );
  console.log("Selesai — tabel bridge_config siap.");
  process.exit(0);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
