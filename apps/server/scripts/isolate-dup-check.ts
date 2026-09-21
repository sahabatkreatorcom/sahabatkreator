/**
 * Isolasi: apakah KODE BARU (yang sudah di-fix) sendiri membuat duplikat
 * cross-account? Kontras dengan worker staging (kode lama) yang memang
 * masih bikin duplikat.
 *
 * Cara: snapshot itemId duplikat → sync 1x pakai fungsi produksi → cek
 * apakah ada itemId baru yang muncul di >1 akun.
 */
import { resolve } from "node:path";
import { db } from "@sahabatkreator/db";
import { engagementItem, socialAccount } from "@sahabatkreator/db/schema";
import { syncAccountEngagement } from "@sahabatkreator/publishing";
import { config } from "dotenv";
import { eq } from "drizzle-orm";

config({ path: resolve(process.cwd(), "../../.env") });

async function snapshot() {
  const rows = await db
    .select({
      socialAccountId: engagementItem.socialAccountId,
      itemId: engagementItem.platformItemId,
      authorName: engagementItem.authorName,
    })
    .from(engagementItem);
  const byItem = new Map<string, Set<string>>();
  for (const r of rows) {
    const s = byItem.get(r.itemId) ?? new Set();
    s.add(r.socialAccountId);
    byItem.set(r.itemId, s);
  }
  return { byItem, total: rows.length };
}

async function main() {
  const before = await snapshot();
  const dupBefore = [...before.byItem.entries()].filter(([, s]) => s.size > 1);

  const accounts = await db
    .select({
      id: socialAccount.id,
      organizationId: socialAccount.organizationId,
      platform: socialAccount.platform,
      username: socialAccount.username,
      metadata: socialAccount.metadata,
    })
    .from(socialAccount)
    .where(eq(socialAccount.isConnected, true));
  const bridge = accounts.filter((a) => a.metadata?.replizAccountId);

  console.log(`duplikat sebelum sync: ${dupBefore.length} itemId\n`);

  // Sync PERSIS seperti yang worker lakukan (kode baru)
  for (const a of bridge) {
    const r = await syncAccountEngagement({
      account: {
        id: a.id,
        organizationId: a.organizationId,
        platform: a.platform,
        platformAccountId: String(a.metadata?.replizAccountId),
        accessTokenEnc: null,
        metadata: a.metadata,
      },
      accessToken: "",
    });
    if (r.newItems > 0 || r.error) {
      console.log(`  ${a.platform} @${a.username}: new=${r.newItems} err=${r.error ?? "-"}`);
    }
  }

  const after = await snapshot();
  const newItems = [...after.byItem.entries()].filter(
    ([itemId, s]) => !before.byItem.has(itemId) && s.size > 1,
  );
  const grew = [...after.byItem.entries()].filter(
    ([itemId, s]) => before.byItem.has(itemId) && (before.byItem.get(itemId)?.size ?? 0) < s.size,
  );

  console.log(`\ntotal item: ${before.total} → ${after.total}`);
  console.log(`duplikat BARU yang dibuat kode ini: ${newItems.length + grew.length}`);
  if (newItems.length + grew.length > 0) {
    console.log("FAIL — kode baru masih membuat duplikat cross-account");
    for (const [itemId, s] of [...newItems, ...grew]) {
      console.log(`  ${itemId}: ${s.size} akun`);
    }
    process.exit(1);
  }
  console.log("PASS — kode baru tidak membuat duplikat cross-account");
  console.log("(duplikat lama yang ada = buatan worker staging dgn kode lama)");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
