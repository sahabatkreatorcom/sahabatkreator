// Apply schema activity_log (raw SQL — tanpa TTY konfirmasi drizzle-kit)
// Jalankan: bun packages/db/scripts/apply-activity-log.ts

import { resolve } from "node:path";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { db } from "../src/index";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS activity_log (
      id text PRIMARY KEY,
      organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      user_id text REFERENCES "user"(id) ON DELETE SET NULL,
      action text NOT NULL,
      target_type text,
      target_id text,
      metadata jsonb,
      created_at timestamp DEFAULT now() NOT NULL
    );
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS activity_log_organizationId_idx
      ON activity_log (organization_id);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS activity_log_createdAt_idx
      ON activity_log (created_at);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS activity_log_action_idx
      ON activity_log (action);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS activity_log_userId_idx
      ON activity_log (user_id);
  `);
  console.log("OK — tabel activity_log siap");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
