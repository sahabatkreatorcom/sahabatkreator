// Apply schema report_share (raw SQL — tanpa TTY konfirmasi drizzle-kit)
// Jalankan: bun packages/db/scripts/apply-report-share.ts

import { resolve } from "node:path";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { db } from "../src/index";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS report_share (
      id text PRIMARY KEY,
      organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      token text NOT NULL,
      title text NOT NULL,
      days integer NOT NULL DEFAULT 30,
      account_id text REFERENCES social_account(id) ON DELETE SET NULL,
      created_by_user_id text,
      revoked_at timestamp,
      created_at timestamp DEFAULT now() NOT NULL,
      expires_at timestamp NOT NULL
    );
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS report_share_token_uidx ON report_share (token);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS report_share_organization_idx ON report_share (organization_id);
  `);
  console.log("OK — tabel report_share siap");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
