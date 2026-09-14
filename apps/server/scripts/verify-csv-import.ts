// E2E verifikasi CSV bulk import — parser, validasi, import ke DB, cleanup.
// Jalankan: bun scripts/verify-csv-import.ts (dari apps/server)
//
// Skenario:
// 1. parseCsv — quote, koma dalam quote, escape double-quote, CRLF
// 2. importCsvPosts preview — validasi platform belum tersambung, jadwal lewat,
//    caption kosong, format tanggal salah
// 3. importCsvPosts importMode — postGroup + post per platform tersimpan benar
//    (status scheduled, hashtags ter-append ke content)
// 4. cleanup data test

import { resolve } from "node:path";
import { db } from "@sahabatkreator/db";
import { organization, post, postGroup, socialAccount, user } from "@sahabatkreator/db/schema";
import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { importCsvPosts, parseCsv } from "../src/lib/csv-import";
import { generateId } from "../src/lib/id";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  const pass = (name: string, ok: boolean, detail: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} — ${name}: ${detail}`);
    if (!ok) process.exitCode = 1;
  };

  // --- Unit: parseCsv ---
  const parsed = parseCsv(
    'caption,platforms\n"Promo diskon, murah banget",instagram,tiktok\n"Kutip ""dalam"" caption",facebook',
  );
  pass("parseCsv jumlah baris", parsed.length === 3, `${parsed.length} baris`);
  pass(
    "parseCsv koma dalam quote",
    parsed[1]?.[0] === "Promo diskon, murah banget",
    parsed[1]?.[0] ?? "?",
  );
  pass(
    "parseCsv quote ter-escape",
    parsed[2]?.[0] === 'Kutip "dalam" caption',
    parsed[2]?.[0] ?? "?",
  );
  pass(
    "parseCsv kolom tanpa quote",
    parsed[1]?.[1] === "instagram" && parsed[1]?.[2] === "tiktok",
    `${parsed[1]?.[1]},${parsed[1]?.[2]}`,
  );

  const parsedCrlf = parseCsv("a,b\r\nc,d\r\n");
  pass(
    "parseCsv CRLF",
    parsedCrlf.length === 2 && parsedCrlf[1]?.[0] === "c",
    `baris 2 kol 1 = ${parsedCrlf[1]?.[0]}`,
  );

  // --- Setup: org + akun riil ---
  const [org] = await db.select({ id: organization.id }).from(organization).limit(1);
  if (!org) {
    console.error("FAIL — tidak ada organization di DB");
    process.exit(1);
  }
  const [adminUser] = await db.select({ id: user.id }).from(user).limit(1);
  if (!adminUser) {
    console.error("FAIL — tidak ada user di DB");
    process.exit(1);
  }
  const accounts = await db
    .select({ id: socialAccount.id, platform: socialAccount.platform })
    .from(socialAccount)
    .where(eq(socialAccount.organizationId, org.id));
  let igAccount = accounts.find((a) => a.platform === "instagram");
  // Seed akun instagram test bila belum ada (untuk validasi import)
  let seededAccountId: string | null = null;
  if (!igAccount) {
    seededAccountId = generateId("social");
    await db.insert(socialAccount).values({
      id: seededAccountId,
      organizationId: org.id,
      platform: "instagram",
      platformAccountId: `verify-csv-${Date.now()}`,
      username: "verify_csv_test",
      displayName: "Verify CSV Test",
      isConnected: true,
    });
    igAccount = { id: seededAccountId, platform: "instagram" };
  }
  const futureDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const pastDate = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  // --- Preview: baris valid + berbagai error ---
  const previewCsv = [
    "caption,platforms,scheduled_date,scheduled_time,hashtags,first_comment",
    `Promo valid via CSV,instagram,${futureDate},09:00,promo,diskon,Jangan lupa ya!`,
    `Jadwal sudah lewat,instagram,${pastDate},09:00,,`,
    "Caption kosong,instagram,",
    ",instagram,,",
    "Platform tidak tersambung,bluesky,,",
    "Tanggal salah format,instagram,31-12-2026,09:00,,",
    "Semua ok tanpa jadwal → draft,instagram,,,tips,",
  ].join("\n");

  const preview = await importCsvPosts(org.id, previewCsv, adminUser.id, {
    importMode: false,
  });
  pass("preview total baris", preview.totalRows === 7, `${preview.totalRows} (harus 7)`);
  const rowByCaption = (prefix: string) => preview.rows.find((r) => r.caption.startsWith(prefix));

  const validRow = rowByCaption("Promo valid");
  pass(
    "preview baris valid",
    validRow?.status === "valid" && validRow.scheduledAt !== null,
    validRow?.status ?? "tidak ditemukan",
  );
  pass(
    "error jadwal lewat",
    rowByCaption("Jadwal sudah lewat")?.errors.includes("jadwal sudah lewat") === true,
    (rowByCaption("Jadwal sudah lewat")?.errors ?? []).join("; "),
  );
  // baris dengan caption "" (row: ",instagram,,") → error caption kosong
  const emptyCaption = preview.rows.find((r) => r.caption === "");
  pass(
    "error caption benar-benar kosong",
    emptyCaption?.errors.includes("caption kosong") === true,
    (emptyCaption?.errors ?? []).join("; "),
  );
  pass(
    "error platform belum tersambung",
    rowByCaption("Platform tidak tersambung")?.errors.some((e) =>
      e.includes("belum tersambung"),
    ) === true,
    (rowByCaption("Platform tidak tersambung")?.errors ?? []).join("; "),
  );
  pass(
    "error format tanggal",
    rowByCaption("Tanggal salah format")?.errors.includes(
      "scheduled_date harus format YYYY-MM-DD",
    ) === true,
    (rowByCaption("Tanggal salah format")?.errors ?? []).join("; "),
  );
  pass(
    "baris draft valid (tanpa jadwal)",
    rowByCaption("Semua ok tanpa jadwal")?.status === "valid" &&
      rowByCaption("Semua ok tanpa jadwal")?.scheduledAt === null,
    "valid & tanpa jadwal",
  );
  pass("preview tidak menulis DB", preview.imported === 0, `imported = ${preview.imported}`);

  // --- Import mode: 2 baris valid ---
  const importCsv = [
    "caption,platforms,scheduled_date,scheduled_time,hashtags,first_comment",
    `Post CSV ter-import,instagram,${futureDate},10:30,"csv,test",First comment test`,
    "Draft dari CSV,instagram,,,csv,",
  ].join("\n");

  const imported = await importCsvPosts(org.id, importCsv, adminUser.id, {
    importMode: true,
  });
  pass(
    "import jumlah",
    imported.imported === 2 && imported.validRows === 2,
    `imported=${imported.imported} valid=${imported.validRows}`,
  );

  // Verifikasi DB: postGroup + post tersimpan
  const groupIds = imported.rows
    .map((r) => r.postGroupId)
    .filter((id): id is string => Boolean(id));
  pass("import postGroupId terisi", groupIds.length === 2, `${groupIds.length} group`);

  const posts = await db
    .select({
      id: post.id,
      status: post.status,
      content: post.content,
      hashtags: post.hashtags,
      firstComment: post.firstComment,
      postGroupId: post.postGroupId,
    })
    .from(post)
    .where(inArray(post.postGroupId, groupIds));

  const scheduledPost = posts.find((p) => p.content.startsWith("Post CSV ter-import"));
  pass(
    "post tersimpan status scheduled",
    scheduledPost?.status === "scheduled",
    scheduledPost?.status ?? "tidak ada",
  );
  pass(
    "hashtags ter-append ke content",
    scheduledPost?.content.includes("#csv #test") === true,
    scheduledPost?.content ?? "",
  );
  pass(
    "first_comment tersimpan",
    scheduledPost?.firstComment === "First comment test",
    scheduledPost?.firstComment ?? "",
  );
  pass(
    "draft tanpa jadwal → status draft",
    posts.find((p) => p.content.startsWith("Draft dari CSV"))?.status === "draft",
    posts.find((p) => p.content.startsWith("Draft dari CSV"))?.status ?? "tidak ada",
  );

  // --- Cleanup ---
  await db.delete(post).where(inArray(post.postGroupId, groupIds));
  await db.delete(postGroup).where(inArray(postGroup.id, groupIds));
  if (seededAccountId) {
    await db.delete(socialAccount).where(eq(socialAccount.id, seededAccountId));
  }
  const remaining = await db
    .select({ id: post.id })
    .from(post)
    .where(inArray(post.postGroupId, groupIds));
  pass("cleanup post test", remaining.length === 0, "data test dihapus");

  console.log("\nSelesai.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
