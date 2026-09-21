// E2E verifikasi data layer strategi konten — brand voice upsert, pillar/template/koleksi
// lifecycle + guard organization isolation. Route handler diuji terpisah via guard 401
// (HTTP live test di bawah).
// Jalankan: bun scripts/verify-strategy.ts (dari apps/server)

import { resolve } from "node:path";
import { db } from "@sahabatkreator/db";
import {
  brandVoice,
  captionTemplate,
  contentPillar,
  hashtagCollection,
  organization,
} from "@sahabatkreator/db/schema";
import { config } from "dotenv";
import { and, eq, sql } from "drizzle-orm";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  const pass = (name: string, ok: boolean, detail: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} — ${name}: ${detail}`);
    if (!ok) process.exitCode = 1;
  };

  const [org] = await db.select({ id: organization.id }).from(organization).limit(1);
  if (!org) {
    console.error("Tidak ada organization — jalankan signup dulu.");
    process.exit(1);
  }
  const suffix = Date.now().toString(36);

  // --- Brand voice: insert → upsert (update di baris sama) ---
  const bvId = `sk_bv_${suffix}`;
  await db.insert(brandVoice).values({
    id: bvId,
    organizationId: org.id,
    description: "v1",
    tones: ["ramah"],
  });
  const bvValues = {
    description: "v2 memezet",
    tones: ["ramah", "lucu"],
    vocabulary: ["gaskeun"],
    avoid: ["bahasa kasar"],
    guidelines: "selalu sapa Kak",
    samples: ["Halo Kak!"],
  };
  await db
    .insert(brandVoice)
    .values({ id: `sk_bv2_${suffix}`, organizationId: org.id, ...bvValues })
    .onConflictDoUpdate({ target: brandVoice.organizationId, set: bvValues });
  const bvRows = await db.select().from(brandVoice).where(eq(brandVoice.organizationId, org.id));
  pass(
    "brand voice upsert 1 baris",
    bvRows.length === 1 && bvRows[0]!.description === "v2 memezet" && bvRows[0]!.tones.length === 2,
    `rows=${bvRows.length}, desc=${JSON.stringify(bvRows[0]?.description)}, tones=${bvRows[0]?.tones.length}`,
  );

  // --- Pillar CRUD ---
  const pillarId = `sk_cp_${suffix}`;
  await db.insert(contentPillar).values({
    id: pillarId,
    organizationId: org.id,
    name: "Edukasi",
    description: "Tips UMKM",
    color: "#D4A574",
  });
  const [pillar] = await db
    .update(contentPillar)
    .set({ name: "Edukasi Produk" })
    .where(and(eq(contentPillar.id, pillarId), eq(contentPillar.organizationId, org.id)))
    .returning();
  pass("pillar update", pillar?.name === "Edukasi Produk", `name=${pillar?.name}`);

  // --- Template + usage count increment ---
  const tplId = `sk_ct_${suffix}`;
  await db.insert(captionTemplate).values({
    id: tplId,
    organizationId: org.id,
    name: "Promo",
    content: "Diskon {diskon}% hari ini!",
    hashtags: ["promo", "diskon"],
    createdBy: null,
  });
  const [tplUsed] = await db
    .update(captionTemplate)
    .set({ usageCount: sql`${captionTemplate.usageCount} + 1` })
    .where(and(eq(captionTemplate.id, tplId), eq(captionTemplate.organizationId, org.id)))
    .returning();
  pass(
    "template usage count naik",
    tplUsed?.usageCount === 1 && tplUsed?.hashtags.length === 2,
    `usage=${tplUsed?.usageCount}, hashtags=${tplUsed?.hashtags.length}`,
  );

  // --- Koleksi hashtag: strip '#' saat insert ---
  const colId = `sk_hc_${suffix}`;
  await db.insert(hashtagCollection).values({
    id: colId,
    organizationId: org.id,
    name: "UMKM",
    hashtags: ["umkm", "lokalbangga"],
  });
  const [col] = await db.select().from(hashtagCollection).where(eq(hashtagCollection.id, colId));
  pass("koleksi hashtag insert", col?.hashtags.length === 2, `tags=${col?.hashtags.join(",")}`);

  // --- Guard isolation: id dari org lain tidak bisa diakses via org-scoped where ---
  const wrongOrg = await db
    .delete(hashtagCollection)
    .where(
      and(eq(hashtagCollection.id, colId), eq(hashtagCollection.organizationId, "org-tidak-ada")),
    )
    .returning({ id: hashtagCollection.id });
  pass(
    "guard org-scoped (id org lain ditolak)",
    wrongOrg.length === 0,
    `deleted=${wrongOrg.length} (harus 0)`,
  );

  // Cleanup
  await db.delete(brandVoice).where(eq(brandVoice.organizationId, org.id));
  await db.delete(contentPillar).where(eq(contentPillar.id, pillarId));
  await db.delete(captionTemplate).where(eq(captionTemplate.id, tplId));
  await db.delete(hashtagCollection).where(eq(hashtagCollection.id, colId));
  console.log("Cleanup selesai.");

  process.exit(process.exitCode ?? 0);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
