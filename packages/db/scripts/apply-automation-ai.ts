// Apply kolom automation AI reply ke DB live (tanpa TTY drizzle-kit push).
//
// Menambahkan:
// - automation_log.engagement_item_id (cek "sudah dibalas manual" sebelum kirim)
// - automation_log.due_at (delay job ai_reply — DB fallback polling)
// - automation_log.status diperluas: pending | drafted | skipped | sent | failed
// - index due_at + status untuk fallback polling
// - engagement_item.draft_reply (draft balasan AI dry-run, belum terkirim)
import { resolve } from "node:path";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { db } from "../src/index";

config({ path: resolve(process.cwd(), "../../.env") });

const STATEMENTS = [
  `ALTER TABLE "automation_log" ADD COLUMN IF NOT EXISTS "engagement_item_id" text`,
  `ALTER TABLE "automation_log" ADD COLUMN IF NOT EXISTS "due_at" timestamp`,
  // Status diperluas — CHECK constraint lama (jika ada) tidak ada, jadi hanya
  // perlu update data NULL status (tidak mungkin karena NOT NULL).
  // Postgres text menerima nilai baru tanpa migration tambahan.
  `CREATE INDEX IF NOT EXISTS "automation_log_due_at_idx" ON "automation_log" ("due_at", "status")`,
  `ALTER TABLE "engagement_item" ADD COLUMN IF NOT EXISTS "draft_reply" text`,
];

async function main() {
  console.log("[apply-automation-ai] mulai...");
  for (const stmt of STATEMENTS) {
    await db.execute(sql.raw(stmt));
    console.log(`[apply-automation-ai] OK: ${stmt.slice(0, 70)}...`);
  }
  console.log("[apply-automation-ai] selesai");
  process.exit(0);
}

main().catch((err) => {
  console.error("[apply-automation-ai] gagal:", err);
  process.exit(1);
});
