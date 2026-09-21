// Apply schema app_review_tracking + api_quota_snapshot (raw SQL — tanpa TTY konfirmasi drizzle-kit)

import { resolve } from "node:path";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { db } from "../src/index";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS app_review_tracking (
      id text PRIMARY KEY,
      platform text NOT NULL,
      submission_id text,
      permission_scope text,
      title text NOT NULL,
      description text,
      status text NOT NULL DEFAULT 'not_started',
      dashboard_url text,
      submitted_at timestamp,
      resolved_at timestamp,
      deadline_at timestamp,
      rejection_reason text,
      checklist jsonb,
      notes jsonb,
      status_history jsonb,
      created_at timestamp DEFAULT now() NOT NULL,
      updated_at timestamp DEFAULT now() NOT NULL
    );
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS app_review_platform_idx ON app_review_tracking (platform);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS app_review_status_idx ON app_review_tracking (status);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS app_review_deadline_idx ON app_review_tracking (deadline_at);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS api_quota_snapshot (
      id text PRIMARY KEY,
      platform text NOT NULL,
      entity_id text NOT NULL,
      quota_type text NOT NULL,
      remaining integer NOT NULL DEFAULT 0,
      total integer NOT NULL,
      date date NOT NULL,
      synced_at timestamp DEFAULT now() NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL
    );
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS api_quota_entity_type_date_uidx
      ON api_quota_snapshot (entity_id, quota_type, date);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS api_quota_platform_date_idx ON api_quota_snapshot (platform, date);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS api_quota_entity_idx ON api_quota_snapshot (entity_id);
  `);
  console.log("OK — tabel app_review_tracking & api_quota_snapshot siap");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
