// E2E verifikasi cross-post variations — post dengan caption custom per platform.
// Jalankan: bun scripts/verify-variations.ts (dari apps/server)
//
// Skenario:
// 1. Insert postGroup + 2 post (satu custom content, satu null) — simulasi payload compose
// 2. Fallback: post.content null → pakai groupContent (pattern buildPublishInput)
// 3. Custom: post.content terisi → dipakai apa pun groupContent
// 4. Cleanup

import { resolve } from "node:path";
import { db } from "@sahabatkreator/db";
import { organization, post, postGroup, socialAccount, user } from "@sahabatkreator/db/schema";
import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
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

  // Simulasi payload compose: caption utama + variasi IG custom + variasi lain kosong
  const groupId = generateId("pg");
  const captionUtama = "Caption utama lintas platform #promo";
  const igCaptionCustom = "Versi khusus IG — storytelling lebih panjang #promo #igonly";
  const liCaptionCustom = "Versi profesional buat LinkedIn";

  await db.insert(postGroup).values({
    id: groupId,
    organizationId: org.id,
    content: captionUtama,
    scheduledAt: null,
    createdByUserId: adminUser.id,
  });

  // Seed akun test (FK post → social_account)
  const accountDefs = [
    { platform: "instagram" as const, username: "verify_var_ig" },
    { platform: "linkedin" as const, username: "verify_var_li" },
    { platform: "facebook" as const, username: "verify_var_fb" },
  ];
  const accountIds: string[] = [];
  for (const def of accountDefs) {
    const accId = generateId("social");
    accountIds.push(accId);
    await db.insert(socialAccount).values({
      id: accId,
      organizationId: org.id,
      platform: def.platform,
      platformAccountId: `${def.username}-${Date.now()}`,
      username: def.username,
      isConnected: true,
    });
  }

  const postIds = [generateId("post"), generateId("post"), generateId("post")];
  await db.insert(post).values([
    {
      id: postIds[0]!,
      organizationId: org.id,
      postGroupId: groupId,
      socialAccountId: accountIds[0]!,
      platform: "instagram",
      status: "draft",
      content: igCaptionCustom, // variasi custom IG
      hashtags: ["promo", "igonly"],
    },
    {
      id: postIds[1]!,
      organizationId: org.id,
      postGroupId: groupId,
      socialAccountId: accountIds[1]!,
      platform: "linkedin",
      status: "draft",
      content: liCaptionCustom, // variasi custom LinkedIn
      hashtags: [],
    },
    {
      id: postIds[2]!,
      organizationId: org.id,
      postGroupId: groupId,
      socialAccountId: accountIds[2]!,
      platform: "facebook",
      status: "draft",
      content: null, // tanpa variasi → null
      hashtags: [],
    },
  ]);

  const rows = await db
    .select({ id: post.id, content: post.content })
    .from(post)
    .where(inArray(post.id, postIds));

  // Pattern pipeline.ts line 124: const content = row.post.content ?? row.groupContent
  const resolveContent = (row: { content: string | null }) => row.content ?? captionUtama;
  const ig = rows.find((r) => r.id === postIds[0])!;
  const li = rows.find((r) => r.id === postIds[1])!;
  const fb = rows.find((r) => r.id === postIds[2])!;

  pass(
    "variasi IG custom tersimpan & dipakai",
    resolveContent(ig) === igCaptionCustom,
    "custom IG",
  );
  pass(
    "variasi LinkedIn custom tersimpan & dipakai",
    resolveContent(li) === liCaptionCustom,
    "custom LinkedIn",
  );
  pass(
    "tanpa variasi → fallback caption utama",
    resolveContent(fb) === captionUtama,
    "fallback groupContent",
  );
  pass("3 post tersimpan dalam 1 group", rows.length === 3, `${rows.length} post`);

  // Cleanup
  await db.delete(post).where(inArray(post.id, postIds));
  await db.delete(postGroup).where(eq(postGroup.id, groupId));
  await db.delete(socialAccount).where(inArray(socialAccount.id, accountIds));
  pass("cleanup", true, "data test dihapus");

  console.log("\nSelesai.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
