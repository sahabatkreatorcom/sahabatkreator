// E2E verifikasi computeOptimalTimes — slot terbaik dari data historis riil.
// Jalankan: bun scripts/verify-optimal-times.ts (dari apps/server)
//
// Skenario:
// 1. Seeded post published + analytics dengan engagement tinggi di Selasa 19:00 WIB
//    dan rendah di Senin 03:00 WIB → top slot harus Sel 19.00, slot Sen 03.00 skor rendah
// 2. Slot heuristik: platform tanpa data historis → heuristic=true, confidence=low
// 3. nextOccurrence: slot di masa depan → tanggal > sekarang, jam sesuai slot (WIB)

import { resolve } from "node:path";
import { db } from "@sahabatkreator/db";
import {
  accountAnalytics,
  organization,
  post,
  postAnalytics,
  postGroup,
  socialAccount,
} from "@sahabatkreator/db/schema";
import { computeOptimalTimes, nextOccurrence, slotLabel } from "@sahabatkreator/publishing";
import { config } from "dotenv";
import { eq } from "drizzle-orm";

config({ path: resolve(process.cwd(), "../../.env") });

/** Sel/WIB 2026-09-08 19:00 = UTC 12:00 */
const TUE_19_UTC = new Date(Date.UTC(2026, 8, 8, 12, 0, 0));
/** Sen/WIB 2026-09-07 03:00 = UTC sebelumnya 20:00 */
const MON_03_UTC = new Date(Date.UTC(2026, 8, 6, 20, 0, 0));

async function main() {
  const pass = (name: string, ok: boolean, detail: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} — ${name}: ${detail}`);
    if (!ok) process.exitCode = 1;
  };

  // Ambil org pertama
  const [org] = await db.select({ id: organization.id }).from(organization).limit(1);
  if (!org) {
    console.error("Tidak ada organization di DB — jalankan signup dulu.");
    process.exit(1);
  }

  // Seed data test: akun instagram (data) + akun tiktok (tanpa data → heuristik)
  const suffix = Date.now().toString(36);
  const igAccountId = `sk_acc_ot_${suffix}`;
  const igGroupId = `sk_pg_ot_${suffix}`;
  const tuePostId = `sk_post_ot_tue_${suffix}`;
  const monPostId = `sk_post_ot_mon_${suffix}`;
  await db.insert(socialAccount).values({
    id: igAccountId,
    organizationId: org.id,
    platform: "instagram",
    platformAccountId: igAccountId,
    username: "optimal-times-test",
    isConnected: false,
  });
  await db.insert(postGroup).values({ id: igGroupId, organizationId: org.id, content: "ot test" });
  await db.insert(post).values({
    id: tuePostId,
    organizationId: org.id,
    postGroupId: igGroupId,
    socialAccountId: igAccountId,
    platform: "instagram",
    status: "published",
    platformPostId: `tue_${suffix}`,
    publishedAt: TUE_19_UTC,
  });
  await db.insert(post).values({
    id: monPostId,
    organizationId: org.id,
    postGroupId: igGroupId,
    socialAccountId: igAccountId,
    platform: "instagram",
    status: "published",
    platformPostId: `mon_${suffix}`,
    publishedAt: MON_03_UTC,
  });
  const today = new Date().toISOString().slice(0, 10);
  await db.insert(postAnalytics).values([
    {
      id: `sk_pa_ot1_${suffix}`,
      organizationId: org.id,
      postId: tuePostId,
      socialAccountId: igAccountId,
      platform: "instagram",
      date: today,
      likes: 90,
      comments: 30,
      shares: 20,
      saves: 10,
      views: 1000,
    },
    {
      id: `sk_pa_ot2_${suffix}`,
      organizationId: org.id,
      postId: monPostId,
      socialAccountId: igAccountId,
      platform: "instagram",
      date: today,
      likes: 2,
      comments: 1,
      shares: 1,
      saves: 0,
      views: 50,
    },
  ]);

  try {
    // Skenario 1: slot engagement tinggi menang
    const slots = await computeOptimalTimes(org.id);
    const igSlots = slots.filter((s) => s.platform === "instagram");
    const tue = igSlots.find((s) => s.dayOfWeek === 2 && s.hour === 19);
    const mon = igSlots.find((s) => s.dayOfWeek === 1 && s.hour === 3);
    pass(
      "slot data riil terdeteksi",
      Boolean(tue && mon) && tue!.score > mon!.score && tue!.score === 100,
      `Sel19=${tue ? `${slotLabel(tue)} skor ${tue.score} (eng ${tue.avgEngagement})` : "TIDAK ADA"}, Sen03=${mon ? `skor ${mon.score}` : "TIDAK ADA"}`,
    );
    pass(
      "slot teratas instagram = Sel 19.00",
      igSlots[0]!.dayOfWeek === 2 && igSlots[0]!.hour === 19,
      `teratas: ${slotLabel(igSlots[0]!)} skor ${igSlots[0]!.score}`,
    );

    // Skenario 2: platform tanpa data → heuristik
    const heurSlots = await computeOptimalTimes(org.id, "tiktok");
    pass(
      "heuristik fallback tiktok",
      heurSlots.length > 0 && heurSlots.every((s) => s.heuristic && s.confidence === "low"),
      `${heurSlots.length} slot heuristik, contoh: ${heurSlots[0] ? slotLabel(heurSlots[0]) : "?"} (heuristik=${heurSlots[0]?.heuristic})`,
    );

    // Skenario 3: nextOccurrence di masa depan & jam WIB sesuai
    const next = nextOccurrence({ dayOfWeek: 2, hour: 19 });
    const nextWib = new Date(next.getTime() + 7 * 60 * 60 * 1000);
    pass(
      "nextOccurrence minggu depan bila lewat",
      next.getTime() > Date.now() && nextWib.getUTCDay() === 2 && nextWib.getUTCHours() === 19,
      `next=${next.toISOString()} (WIB ${nextWib.toISOString()})`,
    );

    // Skenario 4: filter platform hanya kembalikan platform itu
    const onlyIg = await computeOptimalTimes(org.id, "instagram");
    pass(
      "filter platform",
      onlyIg.every((s) => s.platform === "instagram") && onlyIg.length > 0,
      `${onlyIg.length} slot, semua instagram`,
    );
  } finally {
    // Cleanup
    await db.delete(postAnalytics).where(eq(postAnalytics.socialAccountId, igAccountId));
    await db.delete(post).where(eq(post.socialAccountId, igAccountId));
    await db.delete(postGroup).where(eq(postGroup.id, igGroupId));
    await db.delete(accountAnalytics).where(eq(accountAnalytics.socialAccountId, igAccountId));
    await db.delete(socialAccount).where(eq(socialAccount.id, igAccountId));
    console.log("Cleanup selesai — data test dihapus.");
  }

  process.exit(process.exitCode ?? 0);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
