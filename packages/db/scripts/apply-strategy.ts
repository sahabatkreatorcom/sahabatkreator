// Apply tabel strategi (brand_voice, hashtag_collection) ke DB live.
// Drizzle-kit push butuh TTY untuk konfirmasi interaktif (tidak tersedia di sini),
// dan migration 0000_strategy.sql meregenerasi seluruh schema — jadi ekstrak
// hanya statement tabel baru yang belum ada di DB.

import { resolve } from "node:path";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { db } from "../src/index";

config({ path: resolve(process.cwd(), "../../.env") });

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "brand_voice" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
    "description" text,
    "tones" text[] DEFAULT '{}' NOT NULL,
    "vocabulary" text[] DEFAULT '{}' NOT NULL,
    "avoid" text[] DEFAULT '{}' NOT NULL,
    "guidelines" text,
    "samples" text[] DEFAULT '{}' NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "brand_voice_organization_uidx" ON "brand_voice" ("organization_id")`,
  `CREATE TABLE IF NOT EXISTS "hashtag_collection" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "hashtags" text[] DEFAULT '{}' NOT NULL,
    "usage_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "hashtag_collection_organization_idx" ON "hashtag_collection" ("organization_id")`,
  // Upgrade tabel caption_template lama (tanpa TTY prompt drizzle-kit push)
  `ALTER TABLE "caption_template" ADD COLUMN IF NOT EXISTS "hashtags" text[] DEFAULT '{}' NOT NULL`,
  `ALTER TABLE "caption_template" ADD COLUMN IF NOT EXISTS "usage_count" integer DEFAULT 0 NOT NULL`,
  `ALTER TABLE "caption_template" ADD COLUMN IF NOT EXISTS "created_by" text`,
  // Tabel notifikasi (pusat notifikasi in-app)
  `CREATE TABLE IF NOT EXISTS "notification" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
    "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "category" text NOT NULL,
    "title" text NOT NULL,
    "message" text,
    "link" text,
    "read_at" timestamp,
    "dismissed_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "notification_user_idx" ON "notification" ("user_id", "created_at")`,
  `CREATE INDEX IF NOT EXISTS "notification_org_idx" ON "notification" ("organization_id")`,
  `ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "dismissed_at" timestamp`,
];

async function main() {
  for (const stmt of STATEMENTS) {
    await db.execute(sql.raw(stmt));
    console.log("OK:", stmt.split("\n")[0]!.trim().slice(0, 80));
  }
  // Cek tabel strategi mana saja yang sudah ada di DB
  const r = await db.execute(
    sql.raw(
      `select table_name from information_schema.tables where table_schema='public' and table_name in ('brand_voice','content_pillar','caption_template','hashtag_collection')`,
    ),
  );
  console.log(
    "Tabel strategi di DB:",
    (r.rows as { table_name: string }[]).map((x) => x.table_name).join(", "),
  );
  console.log("Selesai — tabel strategi siap.");
  process.exit(0);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
