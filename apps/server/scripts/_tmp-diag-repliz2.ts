import { db } from "@sahabatkreator/db";
import { post, socialAccount, postAnalytics } from "@sahabatkreator/db/schema";
import { eq, inArray, and, not } from "drizzle-orm";
import { config } from "dotenv";
import { resolve } from "node:path";
import {
  replizActiveCredentials,
  replizGetSchedule,
  replizListContent,
  replizGetContentStatistic,
} from "../../../packages/publishing/src/repliz";

config({ path: resolve(process.cwd(), ".env") });

async function main() {
  const all = await db.select().from(socialAccount);
  const bridge = all.filter((a) => a.metadata?.replizAccountId);
  const bridgeIds = bridge.map((a) => a.id);

  // Post NON-external (publish via pipeline kita) milik akun bridge
  const ours = await db
    .select()
    .from(post)
    .where(and(inArray(post.socialAccountId, bridgeIds), eq(post.isExternal, false)));
  console.log(`=== Post bridge NON-external (via pipeline kita): ${ours.length}`);
  for (const p of ours) {
    console.log(
      `  ${p.id} | ${p.platform} | status=${p.status} | pid=${p.platformPostId} | url=${p.platformPostUrl} | fc=${p.firstComment ? "YES" : "-"}`,
    );
  }

  // Post EXTERNAL
  const ext = await db
    .select()
    .from(post)
    .where(and(inArray(post.socialAccountId, bridgeIds), eq(post.isExternal, true)));
  console.log(`\n=== Post bridge EXTERNAL (impor): ${ext.length}`);
  const extWithoutUrl = ext.filter((p) => !p.platformPostUrl);
  console.log(`  tanpa url: ${extWithoutUrl.length}`);
  for (const p of extWithoutUrl.slice(0, 5)) {
    console.log(`    ${p.id} | ${p.platform} | pid=${p.platformPostId}`);
  }

  const cred = await replizActiveCredentials();
  if (!cred) { console.log("\nbridge null"); process.exit(0); }

  // Untuk post pipeline kita yang published, cek schedule + content
  for (const p of ours.filter((x) => x.status === "published").slice(0, 4)) {
    const acc = bridge.find((a) => a.id === p.socialAccountId);
    const accId = String(acc?.metadata?.replizAccountId);
    console.log(`\n--- pipeline post ${p.id} (${p.platform}) pid=${p.platformPostId}`);
    const sched = await replizGetSchedule(cred, p.platformPostId!, accId);
    console.log(`  schedule lookup: ${sched ? JSON.stringify(sched) : "(bukan schedule id / tidak ketemu)"}`);
    try {
      const res = await replizListContent(cred, accId, { type: "media" });
      const found = res.docs.find((c) => c.id === p.platformPostId);
      console.log(`  content match: ${found ? `url=${found.url} statistic=${JSON.stringify(found.statistic)}` : "(tidak ketemu di content list)"}`);
    } catch (e) {
      console.log(`  list content err: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Apakah post pipeline kita punya postAnalytics?
  if (ours.length) {
    const pa = await db
      .select()
      .from(postAnalytics)
      .where(inArray(postAnalytics.postId, ours.map((p) => p.id)));
    console.log(`\n=== postAnalytics untuk post pipeline bridge: ${pa.length} rows`);
    for (const r of pa.slice(0, 6)) {
      console.log(
        `  ${r.postId} | likes=${r.likes} comments=${r.comments} views=${r.views} platform=${r.platform}`,
      );
    }
  }

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
