// Apply tabel competitor ke DB live — raw SQL tanpa TTY.

import { resolve } from "node:path";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { db } from "../src/index";

config({ path: resolve(process.cwd(), "../../.env") });

const STATEMENTS = [
  `DO $$ BEGIN
    CREATE TYPE "platform" AS ENUM (
      'instagram','instagram_standalone','facebook','threads','tiktok','youtube',
      'pinterest','linkedin','bluesky','google_business','manual'
    );
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "competitor" (
    "id" text PRIMARY KEY NOT NULL,
    "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
    "platform" "platform" NOT NULL,
    "username" text NOT NULL,
    "display_name" text,
    "avatar_url" text,
    "followers" integer DEFAULT 0 NOT NULL,
    "avg_engagement_rate_bp" integer,
    "posts_per_week" integer,
    "is_verified" boolean DEFAULT false NOT NULL,
    "notes" text,
    "engagement_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "last_updated_by" text,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "competitor_organization_idx" ON "competitor" ("organization_id")`,
  `CREATE INDEX IF NOT EXISTS "competitor_platform_idx" ON "competitor" ("platform")`,
];

async function main() {
  for (const stmt of STATEMENTS) {
    await db.execute(sql.raw(stmt));
    console.log("OK:", stmt.split("\n")[0]!.trim().slice(0, 80));
  }
  console.log("Selesai — tabel competitor siap.");
  process.exit(0);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
