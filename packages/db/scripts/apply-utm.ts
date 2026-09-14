// Apply schema utm_template (raw SQL — tanpa TTY konfirmasi drizzle-kit)

import { resolve } from "node:path";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { db } from "../src/index";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS utm_template (
      id text PRIMARY KEY,
      organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
      name text NOT NULL,
      source text NOT NULL,
      medium text NOT NULL,
      campaign text NOT NULL,
      term text,
      content text,
      usage_count integer NOT NULL DEFAULT 0,
      created_at timestamp DEFAULT now() NOT NULL
    );
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS utm_template_organization_idx ON utm_template (organization_id);
  `);
  console.log("OK — utm_template siap");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
