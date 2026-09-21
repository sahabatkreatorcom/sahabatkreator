import { db } from "@sahabatkreator/db";
import { post, socialAccount, postAnalytics } from "@sahabatkreator/db/schema";
import { eq, inArray } from "drizzle-orm";
import { config } from "dotenv";
import { resolve } from "node:path";
import {
  replizActiveCredentials,
  replizGetSchedule,
  replizListContent,
} from "../../../packages/publishing/src/repliz";

config({ path: resolve(process.cwd(), ".env") });

async function main() {
  // 1) Akun repliz bridge
  const replizAccounts = await db
    .select()
    .from(socialAccount)
    .where(eq(socialAccount.platform, "linkedin_org"));
  console.log("=== linkedin_org accounts:", replizAccounts.length);
  for (const a of replizAccounts) {
    console.log(
      `  ${a.id} | ${a.platformAccountId} | ${a.displayName} | replizAccountId=${a.metadata?.replizAccountId}`,
    );
  }

  // Semua akun bridge (platform apa saja dgn replizAccountId)
  const all = await db.select().from(socialAccount);
  const bridge = all.filter((a) => a.metadata?.replizAccountId);
  console.log("\n=== Semua akun bridge (replizAccountId):", bridge.length);
  for (const a of bridge) {
    console.log(`  ${a.platform} | ${a.displayName} | repliz=${a.metadata?.replizAccountId}`);
  }

  if (bridge.length === 0) {
    console.log("\nTidak ada akun bridge — exit");
    process.exit(0);
  }

  const cred = await replizActiveCredentials();
  if (!cred) {
    console.log("\nBridge tidak terkonfigurasi (replizActiveCredentials null)");
    process.exit(0);
  }
  console.log("\n=== Bridge credentials OK");

  // 2) Post milik akun bridge
  const bridgeIds = bridge.map((a) => a.id);
  const posts = await db
    .select()
    .from(post)
    .where(inArray(post.socialAccountId, bridgeIds));
  console.log(`\n=== Post via bridge: ${posts.length}`);
  for (const p of posts.slice(0, 12)) {
    console.log(
      `  ${p.id} | status=${p.status} | platformPostId=${p.platformPostId} | url=${p.platformPostUrl} | external=${p.isExternal} | firstComment=${p.firstComment ? "YES" : "-"}`,
    );
  }

  // 3) Untuk post published, coba GET schedule & content statistic
  const published = posts.filter((p) => p.status === "published" && p.platformPostId);
  for (const p of published.slice(0, 3)) {
    const acc = bridge.find((a) => a.id === p.socialAccountId);
    const replizAccountId = String(acc?.metadata?.replizAccountId);
    console.log(`\n--- post ${p.id} (platformPostId=${p.platformPostId})`);
    // Cek apakah platformPostId = schedule ID atau content ID?
    const sched = await replizGetSchedule(cred, p.platformPostId!, replizAccountId);
    console.log(`  GET schedule by id -> ${sched ? JSON.stringify(sched) : "(tidak ketemu)"}`);

    // Coba list content, cari by id
    try {
      const res = await replizListContent(cred, replizAccountId, { type: "media" });
      const found = res.docs.find((c) => c.id === p.platformPostId);
      console.log(
        `  content match by platformPostId: ${found ? `url=${found.url}` : "(tidak ada — platformPostId BUKAN content id)"}`,
      );
      if (res.docs[0]) {
        console.log(`  contoh content id pertama: ${res.docs[0].id} url=${res.docs[0].url}`);
      }
    } catch (e) {
      console.log(`  list content error: ${e instanceof Error ? e.message : e}`);
    }
  }

  // 4) postAnalytics untuk post bridge
  if (posts.length) {
    const pa = await db
      .select()
      .from(postAnalytics)
      .where(inArray(postAnalytics.postId, posts.map((p) => p.id)));
    console.log(`\n=== postAnalytics untuk post bridge: ${pa.length} rows`);
  }

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
