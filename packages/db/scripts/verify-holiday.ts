// E2E verify fitur holiday — endpoint + data riil dari seed
// Jalankan: bun apps/server/scripts/verify-holiday.ts

import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(import.meta.dirname, "../../../.env") });

const BASE = process.env.SERVER_URL || "http://localhost:3000";
let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  console.log("== Verify Holiday ==");

  // 1. Auth gate: /api/holiday harus 401 tanpa session
  const noAuth = await fetch(`${BASE}/api/holiday/upcoming`);
  check(
    "GET /api/holiday/upcoming tanpa auth → 401",
    noAuth.status === 401,
    `dapat ${noAuth.status}`,
  );

  // 2. Tabel berisi seed riil
  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const count = await client.query<{ count: string }>("SELECT COUNT(*) FROM holiday");
  const total = Number(count.rows[0]!.count);
  check("Tabel holiday terisi (≥30 seed)", total >= 30, `total ${total}`);

  // 3. Struktur data: 17 Agustus ada dengan ide konten
  const merdeka = await client.query<{
    name: string;
    idea_templates: unknown;
    suggested_hashtags: unknown;
  }>(
    "SELECT name, idea_templates, suggested_hashtags FROM holiday WHERE month = 8 AND day = 17 LIMIT 1",
  );
  check("Hari Kemerdekaan 17/8 ada", merdeka.rows.length === 1);
  const ideas = merdeka.rows[0]?.idea_templates as { angle: string }[] | null;
  check("17/8 punya ideaTemplates", Array.isArray(ideas) && ideas.length >= 2);
  const tags = merdeka.rows[0]?.suggested_hashtags as string[] | null;
  check("17/8 punya suggestedHashtags", Array.isArray(tags) && tags.length >= 2);

  // 4. Scope mix: ada national & international
  const scopes = await client.query<{ scope: string; n: string }>(
    "SELECT scope, COUNT(*) as n FROM holiday GROUP BY scope",
  );
  const scopeMap = Object.fromEntries(scopes.rows.map((r) => [r.scope, Number(r.n)]));
  check("Ada hari besar national (Indonesia)", (scopeMap.national ?? 0) > 0);
  check("Ada hari besar international", (scopeMap.international ?? 0) > 0);

  // 5. Bulan tersebar (data 12 bulan, minimal 9 bulan terisi)
  const months = await client.query<{ month: number }>("SELECT DISTINCT month FROM holiday");
  check(
    "Seed menutup ≥9 bulan dalam setahun",
    months.rows.length >= 9,
    `${months.rows.length} bulan`,
  );

  // 6. Semua ID pakai prefix sk_
  const badIds = await client.query<{ id: string }>(
    "SELECT id FROM holiday WHERE id NOT LIKE 'sk_holiday_%'",
  );
  check("Semua ID prefix sk_holiday_", badIds.rows.length === 0, `${badIds.rows.length} ID salah`);

  // 7. Logic daysUntil (unit test ringan — duplikasi fungsi route)
  const now = new Date();
  const daysUntil = (month: number, day: number) => {
    const target = new Date(now.getFullYear(), month - 1, day);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
    if (diff < 0) diff += 365;
    return diff;
  };
  const sameDay = daysUntil(now.getMonth() + 1, now.getDate());
  check("daysUntil hari ini = 0", sameDay === 0);
  const tomorrow = daysUntil(now.getMonth() + 1, now.getDate() + 1);
  check("daysUntil besok = 1", tomorrow === 1, `dapat ${tomorrow}`);

  await client.end();

  console.log(`\nHasil: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
