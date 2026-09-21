// Apply kolom platform_author_id di engagement_item (kunci data deletion
// callback Meta/IG/Threads) + tabel platform_data_deletion (audit log).
// Jalankan: bun packages/db/scripts/apply-platform-author-id.ts

import { resolve } from "node:path";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { db } from "../src/index";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  await db.execute(sql`
    ALTER TABLE engagement_item
    ADD COLUMN IF NOT EXISTS platform_author_id TEXT;
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS engagement_item_platformAuthorId_idx
    ON engagement_item (platform_author_id);
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS platform_data_deletion (
      id TEXT PRIMARY KEY,
      app TEXT NOT NULL,
      platform TEXT NOT NULL,
      platform_user_id TEXT NOT NULL,
      confirmation_code TEXT NOT NULL,
      status TEXT NOT NULL,
      deleted_items INTEGER NOT NULL DEFAULT 0,
      requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP
    );
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS platform_data_deletion_code_uidx
    ON platform_data_deletion (confirmation_code);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS platform_data_deletion_user_idx
    ON platform_data_deletion (app, platform_user_id);
  `);
  console.log("OK — engagement_item.platform_author_id + platform_data_deletion siap");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
