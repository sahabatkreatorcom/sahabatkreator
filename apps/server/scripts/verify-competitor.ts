// E2E verifikasi competitor benchmark — CRUD + benchmark + insight.
// Jalankan: bun scripts/verify-competitor.ts (dari apps/server)

import { resolve } from "node:path";
import { db } from "@sahabatkreator/db";
import { competitor, organization } from "@sahabatkreator/db/schema";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { getCompetitorBenchmark } from "../src/lib/competitor";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  const pass = (name: string, ok: boolean, detail: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} — ${name}: ${detail}`);
    if (!ok) process.exitCode = 1;
  };

  const [org] = await db.select({ id: organization.id }).from(organization).limit(1);
  if (!org) {
    console.error("Tidak ada organization di DB — jalankan signup dulu.");
    process.exit(1);
  }

  const suffix = Date.now().toString(36);
  const ids = [`sk_cpt_test1_${suffix}`, `sk_cpt_test2_${suffix}`];
  const [id1, id2] = ids;
  if (!id1 || !id2) {
    console.error("Setup ids gagal.");
    process.exit(1);
  }

  // Seed 2 kompetitor: satu kuat (followers besar, engagement tinggi), satu lemah
  await db.insert(competitor).values([
    {
      id: id1,
      organizationId: org.id,
      platform: "instagram",
      username: "kompetitor_kuat",
      displayName: "Kompetitor Kuat",
      followers: 50000,
      avgEngagementRateBp: 500,
      postsPerWeek: 7,
      isVerified: true,
    },
    {
      id: id2,
      organizationId: org.id,
      platform: "tiktok",
      username: "kompetitor_kecil",
      displayName: "Kompetitor Kecil",
      followers: 2000,
      avgEngagementRateBp: 200,
      postsPerWeek: 2,
      isVerified: false,
    },
  ]);

  try {
    const data = await getCompetitorBenchmark(org.id);

    // Skenario 1: agregat benar
    pass(
      "agregat — count & avg followers",
      data.aggregate.count >= 2 && data.aggregate.avgFollowers >= 26000,
      `count=${data.aggregate.count}, avgFollowers=${data.aggregate.avgFollowers} (kuat 50000 + kecil 2000 → ≥26000)`,
    );

    // Skenario 2: kompetitor kuat skor lebih tinggi dari yang kecil
    const kuat = data.competitors.find((c) => c.id === ids[0]);
    const kecil = data.competitors.find((c) => c.id === ids[1]);
    pass(
      "benchmark score — kompetitor kuat > kecil",
      Boolean(kuat && kecil && kuat.benchmarkScore > kecil.benchmarkScore),
      `kuat=${kuat?.benchmarkScore}, kecil=${kecil?.benchmarkScore}`,
    );
    pass(
      "benchmark score rentang 0-100",
      Boolean(
        kuat &&
          kecil &&
          kuat.benchmarkScore >= 0 &&
          kuat.benchmarkScore <= 100 &&
          kecil.benchmarkScore >= 0 &&
          kecil.benchmarkScore <= 100,
      ),
      `kuat=${kuat?.benchmarkScore}, kecil=${kecil?.benchmarkScore}`,
    );

    // Skenario 3: engagement rate bp terkonversi benar (500bp = 5%)
    pass(
      "engagement rate basis point",
      kuat?.avgEngagementRateBp === 500,
      `kuat avgEngagementRateBp=${kuat?.avgEngagementRateBp} (harus 500 = 5.00%)`,
    );

    // Skenario 4: insight teks terisi
    pass("insight benchmark terisi", data.insight.length > 20, `"${data.insight.slice(0, 80)}..."`);

    // Skenario 5: org performance terisi (bisa 0 bila belum ada analytics — tetap valid)
    pass(
      "org performance tersedia",
      typeof data.org.followers === "number" && typeof data.org.postsPerWeek === "number",
      `org followers=${data.org.followers}, postsPerWeek=${data.org.postsPerWeek}`,
    );
  } finally {
    await db.delete(competitor).where(eq(competitor.id, id1));
    await db.delete(competitor).where(eq(competitor.id, id2));
    console.log("Cleanup selesai — data test dihapus.");
  }

  process.exit(process.exitCode ?? 0);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
