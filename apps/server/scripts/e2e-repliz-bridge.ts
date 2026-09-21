/**
 * E2E test akun bridge Repliz — menjalankan sync sesungguhnya melalui fungsi
 * produksi (bukan mock) ke DB staging, lalu verifikasi data mendarat.
 *
 * Menguji: comment sync (engagement), DM sync (Gold+), posts sync, analytics.
 * Ditujukan untuk dijalankan saat akun bridge terhubung & tier Gold+.
 */
import { resolve } from "node:path";
import { db } from "@sahabatkreator/db";
import {
  dmConversation,
  dmMessage,
  engagementItem,
  post,
  socialAccount,
} from "@sahabatkreator/db/schema";
import {
  syncAccountAnalytics,
  syncAccountEngagement,
  syncWorkspacePosts,
} from "@sahabatkreator/publishing";
import { config } from "dotenv";
import { and, eq, inArray } from "drizzle-orm";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
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

  const bridge = accounts
    .filter((a) => a.metadata?.replizAccountId)
    .map((a) => ({
      id: a.id,
      organizationId: a.organizationId,
      platform: a.platform,
      username: a.username,
      replizAccountId: String(a.metadata?.replizAccountId),
    }));
  console.log(`bridge accounts: ${bridge.length}\n`);

  // Snapshot jumlah sebelum sync
  const orgIds = [...new Set(bridge.map((b) => b.organizationId))];
  const before = await countAll(orgIds);

  // ---- 1. ENGAGEMENT (comments) ----
  console.log("=== 1. Engagement sync (comments) ===");
  for (const b of bridge) {
    const r = await syncAccountEngagement({
      account: {
        id: b.id,
        organizationId: b.organizationId,
        platform: b.platform,
        platformAccountId: b.replizAccountId,
        accessTokenEnc: null,
        metadata: { replizAccountId: b.replizAccountId },
      },
      accessToken: "",
    });
    console.log(`  ${b.platform} @${b.username}: new=${r.newItems} err=${r.error ?? "-"}`);
  }

  // ---- 2. DM (Gold+) ----
  console.log("\n=== 2. DM sync (Gold+ Chat API) ===");
  const { syncAccountDMs } = await import("@sahabatkreator/publishing");
  for (const b of bridge) {
    if (!["facebook", "instagram", "instagram_standalone"].includes(b.platform)) continue;
    const r = await syncAccountDMs({
      account: {
        id: b.id,
        organizationId: b.organizationId,
        platform: b.platform,
        platformAccountId: b.replizAccountId,
        metadata: { replizAccountId: b.replizAccountId },
      },
      accessToken: "",
    });
    console.log(`  ${b.platform} @${b.username}: new=${r.newItems} err=${r.error ?? "-"}`);
  }

  // ---- 3. POSTS ----
  console.log("\n=== 3. Posts sync ===");
  for (const orgId of orgIds) {
    const r = await syncWorkspacePosts(orgId, 30);
    const ok = r.results.filter((x) => x.success).length;
    console.log(
      `  org ${orgId.slice(0, 12)}…: ${ok}/${r.results.length} akun sukses, ` +
        `${r.postsInserted} post baru`,
    );
    for (const x of r.results.filter((y) => !y.success)) {
      console.log(`    FAIL ${x.platform}: ${x.error}`);
    }
  }

  // ---- 4. ANALYTICS ----
  console.log("\n=== 4. Analytics sync ===");
  for (const b of bridge) {
    const r = await syncAccountAnalytics(
      {
        id: b.id,
        organizationId: b.organizationId,
        platform: b.platform,
        platformAccountId: b.replizAccountId,
        accessTokenEnc: null,
        metadata: { replizAccountId: b.replizAccountId },
      },
      "",
    );
    console.log(
      `  ${b.platform} @${b.username}: saved=${r.accountSaved} posts=${r.postsSynced} err=${r.error ?? "-"}`,
    );
  }

  // ---- Verifikasi data mendarat ----
  console.log("\n=== Verifikasi data di DB staging ===");
  const after = await countAll(orgIds);
  console.log(`engagement items: ${before.engagement} → ${after.engagement}`);
  console.log(`dm conversations : ${before.dmConv} → ${after.dmConv}`);
  console.log(`dm messages      : ${before.dmMsg} → ${after.dmMsg}`);
  console.log(`posts            : ${before.posts} → ${after.posts}`);

  // Cek konten engagement yang tersimpan untuk akun bridge — assert field terisi
  const items = await db
    .select({
      platform: socialAccount.platform,
      authorName: engagementItem.authorName,
      authorUsername: engagementItem.authorUsername,
      content: engagementItem.content,
    })
    .from(engagementItem)
    .innerJoin(socialAccount, eq(engagementItem.socialAccountId, socialAccount.id))
    .where(
      and(
        inArray(
          engagementItem.socialAccountId,
          bridge.map((b) => b.id),
        ),
        eq(socialAccount.isConnected, true),
      ),
    )
    .limit(10);
  const emptyAuthor = items.filter((i) => !i.authorName || !i.content);
  console.log(`\nengagement items milik bridge account: ${items.length} (max 10 ditampilkan)`);
  for (const i of items.slice(0, 3)) {
    console.log(
      `  [${i.platform}] ${i.authorUsername ?? i.authorName}: ${i.content?.slice(0, 50)}`,
    );
  }
  if (emptyAuthor.length > 0) {
    console.log(`FAIL: ${emptyAuthor.length} item dengan author/content kosong (mapping lama?)`);
    process.exitCode = 1;
  } else {
    console.log("PASS: semua engagement item punya author & content");
  }
}

async function countAll(orgIds: string[]) {
  const [e] = await db.select({ n: engagementItem.id }).from(engagementItem).limit(1);
  const engagement = await db.$count(engagementItem);
  const dmConv = await db.$count(dmConversation);
  const dmMsg = await db.$count(dmMessage);
  const posts = await db.$count(post);
  void e;
  void orgIds;
  return { engagement, dmConv, dmMsg, posts };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
