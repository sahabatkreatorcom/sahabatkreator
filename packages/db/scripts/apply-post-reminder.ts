// Apply kolom reminder_at di post_group (pengingat push post manual — M18)

import { resolve } from "node:path";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { db } from "../src/index";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  await db.execute(sql`
    ALTER TABLE post_group
    ADD COLUMN IF NOT EXISTS reminder_at timestamp;
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS post_group_reminderAt_idx
      ON post_group (reminder_at);
  `);

  console.log("OK — kolom post_group.reminder_at siap");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
