// E2E verifikasi Automation — engine keyword trigger + dedup log + stats rule.
// Jalankan: bun scripts/verify-automation.ts (dari apps/server)
//
// Skenario (tanpa kirim ke platform nyata — akun manual → reply gagal "not supported",
// tapi struktur engine (match, dedup, log, stats) tetap terverifikasi):
// 1. Seed org + akun manual + 2 rule (dm: "harga", comment: "promo")
// 2. processAutomation DM cocok rule "harga" — matched, log ter-insert, stats naik
// 3. processAutomation DM sama persis — dedup: tidak double-eksekusi
// 4. processAutomation DM keyword lain — tidak cocok
// 5. processAutomation comment cocok rule "promo" — matched
// 6. Rule nonaktif — tidak dieksekusi
// 7. Personalisasi placeholder {{name}}/{{keyword}}
// 8. Cleanup

import { resolve } from "node:path";
import { db } from "@sahabatkreator/db";
import {
  automationLog,
  automationRule,
  organization as orgTable,
  socialAccount,
} from "@sahabatkreator/db/schema";
import { personalize, processAutomation } from "@sahabatkreator/publishing";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { generateId } from "../src/lib/id";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  const pass = (name: string, ok: boolean, detail: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} — ${name}: ${detail}`);
    if (!ok) process.exitCode = 1;
  };

  // Seed
  const orgId = generateId("org");
  await db.insert(orgTable).values({
    id: orgId,
    name: "Verify Automation Org",
    slug: `verify-auto-${Date.now()}`,
    createdAt: new Date(),
  });
  const accountId = generateId("social");
  await db.insert(socialAccount).values({
    id: accountId,
    organizationId: orgId,
    platform: "manual",
    platformAccountId: `manual-verify-${Date.now()}`,
    username: "verify_manual",
  });

  const ruleDmId = generateId("autol");
  await db.insert(automationRule).values({
    id: ruleDmId,
    organizationId: orgId,
    name: "Balasan Harga",
    source: "dm",
    socialAccountId: null,
    triggers: ["harga", "berapa"],
    action: { type: "reply", message: "Hai {{name}}! Harga produk ada di link bio ya 😊" },
    isActive: true,
  });
  const ruleCommentId = generateId("autol");
  await db.insert(automationRule).values({
    id: ruleCommentId,
    organizationId: orgId,
    name: "Balasan Promo",
    source: "comment",
    triggers: ["promo"],
    action: { type: "reply", message: "Promo masih berjalan sampai akhir bulan!" },
    isActive: true,
  });

  // 1. DM cocok keyword "harga"
  const r1 = await processAutomation({
    organizationId: orgId,
    socialAccountId: accountId,
    source: "dm",
    platformItemId: "verify-msg-1",
    text: "Halo kak, mau tanya harga paket usaha dong",
    partnerName: "Sinta",
    partnerUsername: "sinta_ukm",
    partnerId: "partner_sinta",
  });
  const [ruleAfter1] = await db
    .select()
    .from(automationRule)
    .where(eq(automationRule.id, ruleDmId));
  const log1 = await db
    .select()
    .from(automationLog)
    .where(
      and(eq(automationLog.ruleId, ruleDmId), eq(automationLog.platformItemId, "verify-msg-1")),
    );
  // Akun manual → kirim DM tidak didukung → status failed (tapi log tetap tercatat & rule terpicu)
  pass(
    "DM keyword match",
    r1.matched === true && log1.length === 1 && ruleAfter1.triggeredCount === 1,
    `matched=${r1.matched}, log=${log1.length}, triggered=${ruleAfter1.triggeredCount}, status=${log1[0]?.status}, error="${log1[0]?.error?.slice(0, 60) ?? ""}"`,
  );

  // 2. Dedup: pesan sama diproses ulang → tidak double
  const r2 = await processAutomation({
    organizationId: orgId,
    socialAccountId: accountId,
    source: "dm",
    platformItemId: "verify-msg-1",
    text: "Halo kak, mau tanya harga paket usaha dong",
    partnerName: "Sinta",
    partnerUsername: "sinta_ukm",
    partnerId: "partner_sinta",
  });
  const [ruleAfter2] = await db
    .select()
    .from(automationRule)
    .where(eq(automationRule.id, ruleDmId));
  const logCount = await db
    .select({ id: automationLog.id })
    .from(automationLog)
    .where(eq(automationLog.ruleId, ruleDmId));
  pass(
    "dedup pesan sama",
    r2.matched === false && logCount.length === 1 && ruleAfter2.triggeredCount === 1,
    `matched=${r2.matched} (harus false), log=${logCount.length} (harus 1), triggered=${ruleAfter2.triggeredCount}`,
  );

  // 3. DM tanpa keyword cocok
  const r3 = await processAutomation({
    organizationId: orgId,
    socialAccountId: accountId,
    source: "dm",
    platformItemId: "verify-msg-2",
    text: "Terima kasih infonya!",
    partnerName: "Sinta",
    partnerUsername: "sinta_ukm",
    partnerId: "partner_sinta",
  });
  pass("DM tanpa keyword", r3.matched === false, `matched=${r3.matched} (harus false)`);

  // 4. Komentar cocok keyword "promo"
  const r4 = await processAutomation({
    organizationId: orgId,
    socialAccountId: accountId,
    source: "comment",
    platformItemId: "verify-comment-1",
    text: "Kak masih ada promo gak?",
    partnerName: "Dewi",
    partnerUsername: "dewi_shop",
  });
  const [ruleCommentAfter] = await db
    .select()
    .from(automationRule)
    .where(eq(automationRule.id, ruleCommentId));
  pass(
    "komentar keyword match",
    r4.matched === true && ruleCommentAfter.triggeredCount === 1,
    `matched=${r4.matched}, triggered=${ruleCommentAfter.triggeredCount}`,
  );

  // 5. Rule dinonaktifkan → tidak dieksekusi
  await db
    .update(automationRule)
    .set({ isActive: false })
    .where(eq(automationRule.id, ruleCommentId));
  const r5 = await processAutomation({
    organizationId: orgId,
    socialAccountId: accountId,
    source: "comment",
    platformItemId: "verify-comment-2",
    text: "masih promo gak kak?",
    partnerName: "Dewi",
    partnerUsername: "dewi_shop",
  });
  pass("rule nonaktif di-skip", r5.matched === false, `matched=${r5.matched} (harus false)`);

  // 6. Personalisasi placeholder
  const personalized = personalize(
    "Hai {{name}}, keyword {{keyword}} — @{{username}}",
    {
      organizationId: orgId,
      socialAccountId: accountId,
      source: "dm",
      platformItemId: "x",
      text: "harga",
      partnerName: "Sinta",
      partnerUsername: "sinta_ukm",
    },
    "harga",
  );
  pass(
    "personalisasi placeholder",
    personalized === "Hai Sinta, keyword harga — @sinta_ukm",
    `"${personalized}"`,
  );

  // 7. Rule scoped ke akun lain → tidak dieksekusi
  const otherAccountId = generateId("social");
  await db.insert(socialAccount).values({
    id: otherAccountId,
    organizationId: orgId,
    platform: "manual",
    platformAccountId: `manual-other-${Date.now()}`,
    username: "verify_other",
  });
  await db
    .update(automationRule)
    .set({ isActive: true, socialAccountId: otherAccountId })
    .where(eq(automationRule.id, ruleCommentId));
  const r7 = await processAutomation({
    organizationId: orgId,
    socialAccountId: accountId, // akun asli — bukan akun scope rule
    source: "comment",
    platformItemId: "verify-comment-3",
    text: "masih ada promo?",
    partnerName: "Dewi",
    partnerUsername: "dewi_shop",
  });
  pass(
    "rule scoped akun lain di-skip",
    r7.matched === false,
    `matched=${r7.matched} (harus false)`,
  );

  // Cleanup
  await db.delete(orgTable).where(eq(orgTable.id, orgId));
  console.log("\nSelesai — cleanup OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
