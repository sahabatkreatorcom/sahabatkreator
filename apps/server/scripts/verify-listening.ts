// E2E verifikasi social listening — monitor keyword, sentiment, dedupe, crawler.
// Jalankan: bun scripts/verify-listening.ts (dari apps/server)
//
// Skenario:
// 1. detectSentiment — positif/negatif/question/netral lexicon Indonesia
// 2. matchKeywords — match, excluded term, no match
// 3. syncMonitor — seed engagement items dengan keyword → listening item muncul,
//    dedupe (sync ulang tidak duplikat)
// 4. getListeningSummary — monitor aktif, item, sentiment terhitung
// 5. isSafeUrl via crawl — tidak langsung testable, skip (internal)

import { resolve } from "node:path";
import { db } from "@sahabatkreator/db";
import {
  engagementItem,
  listeningItem,
  listeningMonitor,
  organization,
  postGroup,
  socialAccount,
} from "@sahabatkreator/db/schema";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import {
  detectSentiment,
  getListeningSummary,
  matchKeywords,
  syncMonitor,
} from "../src/lib/listening";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  const pass = (name: string, ok: boolean, detail: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} — ${name}: ${detail}`);
    if (!ok) process.exitCode = 1;
  };

  // --- Unit: sentiment lexicon ---
  pass(
    "sentiment positif",
    detectSentiment("Produknya bagus banget, recommended!") === "positive",
    detectSentiment("Produknya bagus banget, recommended!"),
  );
  pass(
    "sentiment negatif",
    detectSentiment("Pengirimannya lambat dan packaging rusak, kecewa") === "negative",
    detectSentiment("Pengirimannya lambat dan packaging rusak, kecewa"),
  );
  pass(
    "sentiment pertanyaan",
    detectSentiment("Kak, ini restock kapan ya?") === "question",
    detectSentiment("Kak, ini restock kapan ya?"),
  );
  pass(
    "sentiment netral",
    detectSentiment("Sudah sampai alamat tujuan") === "neutral",
    detectSentiment("Sudah sampai alamat tujuan"),
  );

  // --- Unit: keyword match ---
  const matched = matchKeywords(
    "Pesan di sahabat kreator enak",
    ["sahabat kreator", " kompetitor "],
    [],
  );
  pass(
    "keyword match",
    matched.length === 1 && matched[0] === "sahabat kreator",
    JSON.stringify(matched),
  );
  pass(
    "excluded term menolak",
    matchKeywords("sahabat kreator tapi spam", ["sahabat kreator"], ["spam"]).length === 0,
    "excluded → 0 match",
  );
  pass("no match", matchKeywords("halo dunia", ["brand lain"], []).length === 0, "tidak ada match");

  // --- E2E: sync monitor dari engagement internal ---
  const [org] = await db.select({ id: organization.id }).from(organization).limit(1);
  if (!org) {
    console.error("Tidak ada organization di DB — jalankan signup dulu.");
    process.exit(1);
  }

  const suffix = Date.now().toString(36);
  const accountId = `sk_acc_lsn_${suffix}`;
  const groupId = `sk_pg_lsn_${suffix}`;
  const monitorId = `sk_lsn_test_${suffix}`;

  await db.insert(socialAccount).values({
    id: accountId,
    organizationId: org.id,
    platform: "instagram",
    platformAccountId: accountId,
    username: "listening-test",
    isConnected: false,
  });
  await db.insert(postGroup).values({ id: groupId, organizationId: org.id, content: "lsn test" });
  await db.insert(engagementItem).values([
    {
      id: `sk_eng_lsn1_${suffix}`,
      organizationId: org.id,
      socialAccountId: accountId,
      type: "comment",
      status: "unread",
      platformItemId: `lsn1_${suffix}`,
      authorName: "Budi",
      content: "sahabat kreator ini recommended banget",
      occurredAt: new Date(),
    },
    {
      id: `sk_eng_lsn2_${suffix}`,
      organizationId: org.id,
      socialAccountId: accountId,
      type: "comment",
      status: "unread",
      platformItemId: `lsn2_${suffix}`,
      authorName: "Sari",
      content: "pelayanan lambat sekali kecewa",
      occurredAt: new Date(),
    },
    {
      id: `sk_eng_lsn3_${suffix}`,
      organizationId: org.id,
      socialAccountId: accountId,
      type: "comment",
      status: "unread",
      platformItemId: `lsn3_${suffix}`,
      authorName: "Ani",
      content: "beli di toko lain saja",
      occurredAt: new Date(),
    },
  ]);

  try {
    await db.insert(listeningMonitor).values({
      id: monitorId,
      organizationId: org.id,
      name: "Test Monitor",
      keywords: ["sahabat kreator", "pelayanan"],
      excludedTerms: [],
      platforms: [],
      isActive: true,
    });

    // Sync pertama
    const r1 = await syncMonitor(monitorId);
    const items1 = await db
      .select()
      .from(listeningItem)
      .where(eq(listeningItem.monitorId, monitorId));

    pass(
      "sync menemukan item yang cocok",
      r1.newItems === 2 && items1.length === 2,
      `newItems=${r1.newItems}, total=${items1.length} (harus 2: comment Budi & Sari)`,
    );

    // item Budi = positif, Sari = negatif
    const budi = items1.find((i) => i.authorName === "Budi");
    const sari = items1.find((i) => i.authorName === "Sari");
    pass(
      "sentiment per item",
      budi?.sentiment === "positive" && sari?.sentiment === "negative",
      `Budi=${budi?.sentiment}, Sari=${sari?.sentiment}`,
    );

    // keyword highlight data
    pass(
      "matchedKeywords terisi",
      Boolean(budi?.matchedKeywords.includes("sahabat kreator")),
      `Budi matched: ${JSON.stringify(budi?.matchedKeywords)}`,
    );

    // Sync kedua — dedupe
    const r2 = await syncMonitor(monitorId);
    const items2 = await db
      .select()
      .from(listeningItem)
      .where(eq(listeningItem.monitorId, monitorId));
    pass(
      "dedupe — sync ulang tidak duplikat",
      r2.newItems === 0 && items2.length === 2,
      `sync ke-2 newItems=${r2.newItems}, total tetap ${items2.length}`,
    );

    // Summary
    const summary = await getListeningSummary(org.id);
    pass(
      "summary — monitor aktif terhitung",
      summary.activeMonitors >= 1 && summary.totalItems >= 2,
      `activeMonitors=${summary.activeMonitors}, totalItems=${summary.totalItems}`,
    );
  } finally {
    // Cleanup
    await db.delete(listeningItem).where(eq(listeningItem.monitorId, monitorId));
    await db.delete(listeningMonitor).where(eq(listeningMonitor.id, monitorId));
    await db.delete(engagementItem).where(eq(engagementItem.socialAccountId, accountId));
    await db.delete(postGroup).where(eq(postGroup.id, groupId));
    await db.delete(socialAccount).where(eq(socialAccount.id, accountId));
    console.log("Cleanup selesai — data test dihapus.");
  }

  process.exit(process.exitCode ?? 0);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
