// Apply tabel social listening (listening_monitor, listening_item, listening_source)
// ke DB live — raw SQL tanpa TTY (pattern sama dengan apply-strategy.ts).

import { resolve } from "node:path";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { db } from "../src/index";

config({ path: resolve(process.cwd(), "../../.env") });

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "listening_monitor" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "excluded_terms" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "last_synced_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "listening_monitor_organization_idx" ON "listening_monitor" ("organization_id")`,
  `CREATE TABLE IF NOT EXISTS "listening_item" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
    "monitor_id" text NOT NULL REFERENCES "listening_monitor"("id") ON DELETE CASCADE,
    "source_type" text NOT NULL,
    "platform" text NOT NULL,
    "source_id" text NOT NULL,
    "external_url" text,
    "author_name" text,
    "author_avatar_url" text,
    "content" text,
    "media_url" text,
    "sentiment" text DEFAULT 'neutral' NOT NULL,
    "matched_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "occurred_at" timestamp DEFAULT now() NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "listening_item_monitor_source_uidx" ON "listening_item" ("monitor_id", "source_id")`,
  `CREATE INDEX IF NOT EXISTS "listening_item_organization_idx" ON "listening_item" ("organization_id")`,
  `CREATE INDEX IF NOT EXISTS "listening_item_occurredAt_idx" ON "listening_item" ("occurred_at")`,
  `CREATE INDEX IF NOT EXISTS "listening_item_monitorId_idx" ON "listening_item" ("monitor_id")`,
  `CREATE TABLE IF NOT EXISTS "listening_source" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "url" text NOT NULL,
    "source_type" text DEFAULT 'auto' NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "last_crawled_at" timestamp,
    "last_error" text,
    "last_page_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "listening_source_organization_idx" ON "listening_source" ("organization_id")`,
];

async function main() {
  for (const stmt of STATEMENTS) {
    await db.execute(sql.raw(stmt));
    console.log("OK:", stmt.split("\n")[0]!.trim().slice(0, 80));
  }
  const r = await db.execute(
    sql.raw(
      `select table_name from information_schema.tables where table_schema='public' and table_name like 'listening_%'`,
    ),
  );
  console.log(
    "Tabel listening di DB:",
    (r.rows as { table_name: string }[]).map((x) => x.table_name).join(", "),
  );
  console.log("Selesai — tabel listening siap.");
  process.exit(0);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
