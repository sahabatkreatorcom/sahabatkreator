// Apply schema goal (raw SQL — tanpa TTY konfirmasi drizzle-kit)

import { resolve } from "node:path";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { db } from "../src/index";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS goal (
      id text PRIMARY KEY,
      organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      name text NOT NULL,
      metric text NOT NULL,
      target_value integer NOT NULL,
      baseline_value integer NOT NULL DEFAULT 0,
      start_date date NOT NULL,
      end_date date NOT NULL,
      is_completed boolean NOT NULL DEFAULT false,
      completed_at timestamp,
      created_at timestamp DEFAULT now() NOT NULL
    );
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS goal_organization_idx ON goal (organization_id);
  `);
  console.log("OK — tabel goal siap");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
