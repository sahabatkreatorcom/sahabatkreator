// E2E verifikasi Grid Planner — endpoint /posts/grid query IG + media cover.
// Jalankan: bun scripts/verify-grid.ts (dari apps/server)
//
// Skenario:
// 1. Seed akun IG + postGroup terjadwal + post IG (dengan & tanpa media) + post FB (bukan IG)
// 2. Jalankan query yang sama dengan route /posts/grid
//    → hanya IG, urut scheduledAt desc, media cover join
// 3. Cleanup

import { resolve } from "node:path";
import { db } from "@sahabatkreator/db";
import {
  media as mediaTable,
  organization,
  post,
  postGroup,
  postMedia,
  socialAccount,
  user,
} from "@sahabatkreator/db/schema";
import { config } from "dotenv";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { generateId } from "../src/lib/id";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  const pass = (name: string, ok: boolean, detail: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} — ${name}: ${detail}`);
    if (!ok) process.exitCode = 1;
  };

  const [org] = await db.select({ id: organization.id }).from(organization).limit(1);
  const [adminUser] = await db.select({ id: user.id }).from(user).limit(1);
  if (!org || !adminUser) {
    console.error("FAIL — butuh organization + user di DB");
    process.exit(1);
  }

  // Seed: akun IG + FB
  const igId = generateId("social");
  const fbId = generateId("social");
  await db.insert(socialAccount).values([
    {
      id: igId,
      organizationId: org.id,
      platform: "instagram",
      platformAccountId: `verify-grid-ig-${Date.now()}`,
      username: "verify_grid_ig",
      isConnected: true,
    },
    {
      id: fbId,
      organizationId: org.id,
      platform: "facebook",
      platformAccountId: `verify-grid-fb-${Date.now()}`,
      username: "verify_grid_fb",
      isConnected: true,
    },
  ]);

  // Media dummy (url R2 placeholder pattern valid)
  const mediaId = generateId("media");
  await db.insert(mediaTable).values({
    id: mediaId,
    organizationId: org.id,
    name: "verify-grid-cover.jpg",
    type: "image",
    storageKey: `verify/grid-${Date.now()}.jpg`,
    url: "https://example.com/verify-grid-cover.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1000,
  });

  // 2 postGroup: A (jadwal lebih baru, ada media), B (jadwal lebih lama, tanpa media)
  const now = Date.now();
  const groupA = generateId("pg");
  const groupB = generateId("pg");
  await db.insert(postGroup).values([
    {
      id: groupA,
      organizationId: org.id,
      content: "Post IG dengan media",
      scheduledAt: new Date(now + 5 * 86400000),
      createdByUserId: adminUser.id,
    },
    {
      id: groupB,
      organizationId: org.id,
      content: "Post IG tanpa media",
      scheduledAt: new Date(now + 2 * 86400000),
      createdByUserId: adminUser.id,
    },
  ]);

  const postA = generateId("post");
  const postB = generateId("post");
  const postFb = generateId("post");
  await db.insert(post).values([
    {
      id: postA,
      organizationId: org.id,
      postGroupId: groupA,
      socialAccountId: igId,
      platform: "instagram",
      status: "scheduled",
      content: "Post IG dengan media",
    },
    {
      id: postB,
      organizationId: org.id,
      postGroupId: groupB,
      socialAccountId: igId,
      platform: "instagram",
      status: "draft",
      content: null, // fallback ke groupContent
    },
    {
      id: postFb,
      organizationId: org.id,
      postGroupId: groupA,
      socialAccountId: fbId,
      platform: "facebook",
      status: "scheduled",
      content: "Post FB — harus TIDAK muncul di grid",
    },
  ]);
  await db.insert(postMedia).values({
    id: generateId("pmedia"),
    postId: postA,
    mediaId,
    sortOrder: 0,
  });

  // Query yang sama dengan route GET /posts/grid
  const rows = await db
    .select({
      postId: post.id,
      status: post.status,
      content: post.content,
      groupContent: postGroup.content,
      scheduledAt: postGroup.scheduledAt,
      username: socialAccount.username,
      mediaUrl: mediaTable.url,
    })
    .from(post)
    .innerJoin(postGroup, eq(post.postGroupId, postGroup.id))
    .innerJoin(
      socialAccount,
      and(eq(post.socialAccountId, socialAccount.id), eq(socialAccount.platform, "instagram")),
    )
    .leftJoin(postMedia, and(eq(postMedia.postId, post.id), eq(postMedia.sortOrder, 0)))
    .leftJoin(mediaTable, eq(postMedia.mediaId, mediaTable.id))
    .where(
      and(
        eq(post.organizationId, org.id),
        inArray(post.status, ["published", "scheduled", "draft", "publishing"]),
      ),
    )
    .orderBy(desc(sql`coalesce(${postGroup.scheduledAt}, ${postGroup.createdAt})`))
    .limit(90);

  pass(
    "hanya post IG (FB ter-exclude)",
    rows.length === 2 && rows.every((r) => r.username === "verify_grid_ig"),
    `${rows.length} item (harus 2)`,
  );
  pass(
    "urut scheduledAt desc",
    rows[0]!.scheduledAt! > rows[1]!.scheduledAt!,
    "post A (5 hari) sebelum post B (2 hari)",
  );
  pass(
    "post A punya media cover",
    rows.find((r) => r.postId === postA)?.mediaUrl === "https://example.com/verify-grid-cover.jpg",
    "media join OK",
  );
  pass(
    "post B tanpa media → null",
    rows.find((r) => r.postId === postB)?.mediaUrl === null,
    "null",
  );
  pass(
    "fallback content ke groupContent",
    rows.find((r) => r.postId === postB)?.content === null &&
      rows.find((r) => r.postId === postB)?.groupContent === "Post IG tanpa media",
    "post.content null → groupContent dipakai",
  );

  // Cleanup
  await db.delete(postMedia).where(eq(postMedia.postId, postA));
  await db.delete(post).where(inArray(post.id, [postA, postB, postFb]));
  await db.delete(postGroup).where(inArray(postGroup.id, [groupA, groupB]));
  await db.delete(mediaTable).where(eq(mediaTable.id, mediaId));
  await db.delete(socialAccount).where(inArray(socialAccount.id, [igId, fbId]));
  pass("cleanup", true, "data test dihapus");

  console.log("\nSelesai.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
