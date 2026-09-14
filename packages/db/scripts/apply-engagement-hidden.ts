// Apply kolom hidden di engagement_item (moderasi inbox, M12)
// Jalankan: bun packages/db/scripts/apply-engagement-hidden.ts

import { resolve } from "node:path";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { db } from "../src/index";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  await db.execute(sql`
    ALTER TABLE engagement_item
    ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS engagement_item_hidden_idx ON engagement_item (hidden);
  `);
  console.log("OK — kolom engagement_item.hidden siap");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
