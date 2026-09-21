// Apply schema report_schedule (raw SQL — tanpa TTY konfirmasi drizzle-kit)

import { resolve } from "node:path";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { db } from "../src/index";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS report_schedule (
      id text PRIMARY KEY,
      organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      email text NOT NULL,
      frequency text NOT NULL,
      send_day integer NOT NULL DEFAULT 1,
      send_hour integer NOT NULL DEFAULT 8,
      is_active boolean NOT NULL DEFAULT true,
      last_sent_at timestamp,
      created_at timestamp DEFAULT now() NOT NULL
    );
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS report_schedule_organization_idx ON report_schedule (organization_id);
  `);
  console.log("OK — tabel report_schedule siap");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
