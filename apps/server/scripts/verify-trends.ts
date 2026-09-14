// E2E verifikasi fetch Google Trends Indonesia — endpoint nyata, data riil.
// Jalankan: bun scripts/verify-trends.ts (dari apps/server)

import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  const { fetchDailyTrendsID } = await import("../src/lib/trends");
  const trends = await fetchDailyTrendsID(20);

  const pass = (name: string, ok: boolean, detail: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} — ${name}: ${detail}`);
    if (!ok) process.exitCode = 1;
  };

  pass("tren tersedia", trends.length > 0, `${trends.length} tren hari ini`);

  if (trends.length > 0) {
    const withTitle = trends.filter((t) => t.title.length > 0).length;
    pass("semua tren punya judul", withTitle === trends.length, `${withTitle}/${trends.length}`);

    const withTraffic = trends.filter((t) => t.approxTraffic).length;
    console.log(`INFO — ${withTraffic}/${trends.length} tren punya estimasi trafik`);

    const withArticles = trends.filter((t) => t.articles.length > 0).length;
    console.log(`INFO — ${withArticles}/${trends.length} tren punya artikel terkait`);

    // Cache: panggil kedua harus sama instan (tanpa fetch ulang)
    const t0 = Date.now();
    const cached = await fetchDailyTrendsID(20);
    const elapsed = Date.now() - t0;
    pass(
      "cache hit (cepat & konsisten)",
      cached.length === trends.length && elapsed < 100,
      `${elapsed}ms, ${cached.length} item`,
    );

    console.log("\nContoh 5 tren teratas:");
    trends.slice(0, 5).forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.title} (${t.approxTraffic ?? "?"})`);
    });
  }

  process.exit(process.exitCode ?? 0);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
