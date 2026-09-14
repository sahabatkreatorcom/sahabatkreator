// E2E verifikasi UTM builder — util generate link + template CRUD.
// Jalankan: bun scripts/verify-utm.ts (dari apps/server)
//
// Skenario:
// 1. buildUtmUrl — lengkap, minimal, URL tanpa protocol, invalid
// 2. findUrls / applyUtmToCaption — deteksi URL di caption & replace
// 3. DB: insert utm_template → fetch per org → usage count → delete

import { resolve } from "node:path";
import { db } from "@sahabatkreator/db";
import { organization, utmTemplate } from "@sahabatkreator/db/schema";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { generateId } from "../src/lib/id";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  const pass = (name: string, ok: boolean, detail: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} — ${name}: ${detail}`);
    if (!ok) process.exitCode = 1;
  };

  // Import util dari web (pure function, aman di server script)
  const { buildUtmUrl, findUrls, applyUtmToCaption } = await import("../../web/src/lib/utm");

  // --- Unit: buildUtmUrl ---
  const full = buildUtmUrl("https://tokosaya.com/promo", {
    source: "instagram",
    medium: "social",
    campaign: "ramadan-2026",
    term: "kue lebaran",
    content: "variasi-a",
  });
  pass(
    "buildUtmUrl lengkap",
    full ===
      "https://tokosaya.com/promo?utm_source=instagram&utm_medium=social&utm_campaign=ramadan-2026&utm_term=kue+lebaran&utm_content=variasi-a",
    full ?? "null",
  );

  const minimal = buildUtmUrl("https://tokosaya.com", {
    source: "tiktok",
    medium: "bio",
    campaign: "grand-opening",
  });
  pass(
    "buildUtmUrl minimal (tanpa term/content)",
    minimal === "https://tokosaya.com/?utm_source=tiktok&utm_medium=bio&utm_campaign=grand-opening",
    minimal ?? "null",
  );

  const noProtocol = buildUtmUrl("tokosaya.com/promo", {
    source: "ig",
    medium: "story",
    campaign: "test",
  });
  pass(
    "buildUtmUrl tanpa protocol → https",
    noProtocol?.startsWith("https://tokosaya.com/promo?") === true,
    noProtocol ?? "null",
  );

  pass(
    "buildUtmUrl URL invalid → null",
    buildUtmUrl("bukan url valid ://", {
      source: "ig",
      medium: "social",
      campaign: "test",
    }) === null,
    "null",
  );

  const encoded = buildUtmUrl("https://tokosaya.com", {
    source: "instagram",
    medium: "social",
    campaign: "promo diskon 50%",
  });
  pass(
    "buildUtmUrl escape spasi & %",
    encoded?.includes("utm_campaign=promo+diskon+50%25") === true,
    encoded ?? "null",
  );

  // --- Unit: findUrls + applyUtmToCaption ---
  const caption =
    "Cek katalog kami di https://tokosaya.com/katalog ya! Ada juga di https://tokosaya.com/promo";
  const urls = findUrls(caption);
  pass(
    "findUrls deteksi 2 URL",
    urls.length === 2 && urls[0] === "https://tokosaya.com/katalog",
    `${urls.length} URL`,
  );
  pass("findUrls caption tanpa URL", findUrls("caption biasa tanpa link").length === 0, "0 URL");

  const utmLink = buildUtmUrl(urls[0]!, {
    source: "instagram",
    medium: "social",
    campaign: "katalog",
  })!;
  const newCaption = applyUtmToCaption(caption, urls[0]!, utmLink);
  pass(
    "applyUtmToCaption replace URL pertama",
    newCaption.includes(utmLink) &&
      !newCaption.includes("https://tokosaya.com/katalog ") &&
      newCaption.includes("https://tokosaya.com/promo"),
    "URL pertama terganti, kedua tetap",
  );

  // --- E2E DB: utm_template ---
  const [org] = await db.select({ id: organization.id }).from(organization).limit(1);
  if (!org) {
    console.error("FAIL — tidak ada organization di DB");
    process.exit(1);
  }

  const templateId = generateId("utm");
  await db.insert(utmTemplate).values({
    id: templateId,
    organizationId: org.id,
    name: "Verify UTM Test",
    source: "instagram",
    medium: "social",
    campaign: "verify-test",
  });

  const fetched = await db
    .select()
    .from(utmTemplate)
    .where(and(eq(utmTemplate.id, templateId), eq(utmTemplate.organizationId, org.id)));
  pass(
    "insert & fetch template",
    fetched.length === 1 && fetched[0]!.source === "instagram" && fetched[0]!.usageCount === 0,
    `${fetched.length} baris`,
  );

  // Simulasi endpoint /use (increment usageCount)
  await db
    .update(utmTemplate)
    .set({ usageCount: fetched[0]!.usageCount + 1 })
    .where(eq(utmTemplate.id, templateId));
  const afterUse = await db
    .select({ usageCount: utmTemplate.usageCount })
    .from(utmTemplate)
    .where(eq(utmTemplate.id, templateId));
  pass(
    "usage count increment",
    afterUse[0]?.usageCount === 1,
    `count = ${afterUse[0]?.usageCount}`,
  );

  // Cleanup
  await db.delete(utmTemplate).where(eq(utmTemplate.id, templateId));
  const remaining = await db
    .select({ id: utmTemplate.id })
    .from(utmTemplate)
    .where(eq(utmTemplate.id, templateId));
  pass("cleanup template test", remaining.length === 0, "dihapus");

  console.log("\nSelesai.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
