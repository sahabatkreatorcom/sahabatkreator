// Apply schema oauth_pending_selection (raw SQL — tanpa TTY konfirmasi drizzle-kit)
// Jalankan: bun packages/db/scripts/apply-oauth-pending.ts

import { resolve } from "node:path";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { db } from "../src/index";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS oauth_pending_selection (
      id text PRIMARY KEY,
      user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      platform platform NOT NULL,
      pages_data text NOT NULL,
      expires_at timestamp NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL
    );
  `);
  await db.execute(sql`
    ALTER TABLE oauth_pending_selection
      ADD COLUMN IF NOT EXISTS organization_id text NOT NULL DEFAULT '';
  `);
  await db.execute(sql`
    ALTER TABLE oauth_pending_selection
      DROP CONSTRAINT IF EXISTS oauth_pending_selection_organization_fk;
  `);
  await db.execute(sql`
    ALTER TABLE oauth_pending_selection
      ADD CONSTRAINT oauth_pending_selection_organization_fk
      FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE;
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS oauth_pending_selection_userId_idx
      ON oauth_pending_selection (user_id);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS oauth_pending_selection_expiresAt_idx
      ON oauth_pending_selection (expires_at);
  `);
  console.log("OK — tabel oauth_pending_selection siap");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
