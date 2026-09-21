/**
 * Backfill satu kali untuk engagement item legacy akun bridge Repliz.
 *
 * Konteks: sebelum fix filter `accountIds[]` (20 Sep 2026), syncRepliz
 * mengirim `accountIds=` (tanpa bracket) yang DIABAIKAN API → sync mengambil
 * komentar seluruh workspace & menyimpannya ke setiap akun bridge. Mapping
 * lama juga baca field flat yang tidak ada (c.user/c.message) → duplikat-
 * duplikat itu tersimpan dgn author & content NULL. Dampak ganda:
 *  1. komentar akun A muncul di inbox akun B (cross-contamination)
 *  2. item-item palsu tak bisa dibalas/dimoderasi (id platform tidak cocok)
 *
 * Script ini membersihkan duplikat cross-account yang masih NULL:
 *  - cari itemId (Repliz _id) yang muncul di >1 akun bridge
 *  - hapus hanya baris dgn author NULL (duplikat palsu); baris dgn author
 *    terisi = lokasi asli, dipertaharkan
 * Idempoten — aman dijalankan berulang.
 *
 * Cara pakai (HARUS dari direktori apps/server):
 *   bun scripts/backfill-repliz-engagement.ts --dry-run   # preview, tanpa hapus
 *   bun scripts/backfill-repliz-engagement.ts              # eksekusi hapus
 */
import { resolve } from "node:path";
import { db } from "@sahabatkreator/db";
import { engagementItem, socialAccount } from "@sahabatkreator/db/schema";
import { config } from "dotenv";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";

config({ path: resolve(process.cwd(), "../../.env") });
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const rows = await db
    .select({
      id: engagementItem.id,
      socialAccountId: engagementItem.socialAccountId,
      platform: socialAccount.platform,
      username: socialAccount.username,
      itemId: engagementItem.platformItemId,
      authorName: engagementItem.authorName,
    })
    .from(engagementItem)
    .innerJoin(socialAccount, eq(engagementItem.socialAccountId, socialAccount.id));

  // Kelompokkan per itemId; identifikasi duplikat cross-account
  const byItem = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byItem.get(r.itemId) ?? [];
    arr.push(r);
    byItem.set(r.itemId, arr);
  }

  const toDelete: string[] = [];
  const kept: string[] = [];
  for (const [, group] of byItem) {
    if (group.length < 2) continue;
    // Lewati bila semua baris punya author (bukan duplikat palsu)
    const nullOnes = group.filter((g) => !g.authorName);
    const filled = group.filter((g) => g.authorName);
    if (nullOnes.length === 0) continue;
    // Hapus duplikat NULL hanya bila ada minimal satu baris dgn author
    // (lokasi asli) — bila semua NULL, jangan sentuh (backfill isi field).
    if (filled.length === 0) continue;
    for (const n of nullOnes) toDelete.push(n.id);
    for (const f of filled) kept.push(`${f.platform}@${f.username}`);
  }

  console.log(`duplikat palsu (NULL, cross-account): ${toDelete.length}`);
  console.log(`baris asli dipertahankan: ${kept.length} (${[...new Set(kept)].join(", ")})`);
  if (toDelete.length === 0) {
    console.log("tidak ada yang dihapus");
    process.exit(0);
  }
  if (DRY_RUN) {
    console.log("\n[DRY-RUN] tidak ada yang dihapus. Jalankan tanpa --dry-run untuk eksekusi.");
    process.exit(0);
  }

  // Hapus batch kecil
  for (let i = 0; i < toDelete.length; i += 10) {
    const batch = toDelete.slice(i, i + 10);
    await db.delete(engagementItem).where(inArray(engagementItem.id, batch));
  }
  console.log(`dihapus: ${toDelete.length} duplikat palsu`);

  // Verifikasi: sisa item NULL yang TIDAK punya pasangan terisi = kandidat
  // backfill isi-field (komentar resolved tak terfetch sync reguler)
  const remaining = await db.$count(engagementItem, isNull(engagementItem.authorName));
  const filledNow = await db.$count(engagementItem, isNotNull(engagementItem.authorName));
  console.log(`\nsisa author NULL: ${remaining}, terisi: ${filledNow}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
