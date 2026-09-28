// Rotasi ENCRYPTION_KEY: decrypt semua kolom *_enc dengan key lama,
// re-encrypt dengan key baru — dalam SATU transaksi.
//
// Mengapa: ENCRYPTION_KEY bisa bocor (log, laptop, ex-staff) atau wajib
// dirotasi periodik demi kepatuhan. Tanpa script ini, rotasi berarti
// memutus semua koneksi social account + webhook: credentialnya harus
// dihapus dan user reconnect manual (alih-alih 1 menik downtime terjadwal).
//
// Script ini DUAL-KEY AWARE — dipakai bersama ENCRYPTION_KEY_OLD (fallback
// decrypt di crypto.ts) sehingga rotasi bisa tanpa maintenance window:
//
//   1. Buat key baru: openssl rand -base64 32
//   2. Set ENCRYPTION_KEY=<baru> + ENCRYPTION_KEY_OLD=<lama> di root .env,
//      lalu restart server + worker + mcp. Decrypt menerima ciphertext lama
//      (fallback) maupun baru; tulisan baru pakai key baru.
//   3. Dry-run (hitung baris yang akan dirotasi, tanpa menulis):
//        ROTATE_OLD_KEY=<lama> ROTATE_NEW_KEY=<baru> bun run db:rotate-key
//   4. Apply (boleh LIVE — decrypt dual-key menjamin request tetap jalan):
//        ROTATE_OLD_KEY=<lama> ROTATE_NEW_KEY=<baru> bun run db:rotate-key --apply
//   5. Verifikasi tidak ada lagi row key-lama (idempoten — boleh berulang):
//        ROTATE_OLD_KEY=<lama> ROTATE_NEW_KEY=<baru> bun run db:rotate-key --verify
//      Exit code 0 = semua row sudah pakai key baru → aman hapus
//      ENCRYPTION_KEY_OLD. Exit 1 = masih ada row key-lama (lihat langkah 4).
//   6. Hapus ENCRYPTION_KEY_OLD dari root .env, restart service.
//
// Catatan safety: --apply menulis ciphertext key-BARU ke DB. Tanpa dual-key
// (langkah 2 di-skip), ada jeda antara commit dan restart env di mana service
// masih pegang key LAMA → setiap request decrypt gagal. Karena itu jalankan
// dual-key atau di maintenance window.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../src/index";

/** Kolom terenkripsi AES-256-GCM — daftar tunggal agar rotasi tidak miss. */
const ENCRYPTED_COLUMNS: ReadonlyArray<{ table: string; column: string }> = [
  { table: "platform_settings", column: "ai_api_key_enc" },
  { table: "platform_settings", column: "sumopod_api_key_enc" },
  { table: "platform_settings", column: "sumopod_webhook_token_enc" },
  { table: "push_subscription", column: "private_key_enc" },
  { table: "social_account", column: "access_token_enc" },
  { table: "social_account", column: "refresh_token_enc" },
  { table: "platform_credential", column: "client_secret_enc" },
  { table: "platform_credential", column: "extra_config_enc" },
  { table: "webhook_endpoint", column: "secret_enc" },
  { table: "bridge_config", column: "secret_enc" },
];

function parseKey(raw: string | undefined, name: string): Buffer {
  if (!raw) {
    throw new Error(`${name} belum diset (generate: openssl rand -base64 32)`);
  }
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`${name} harus 32-byte (base64 atau hex), dapat ${key.length} byte`);
  }
  return key;
}

/** Decrypt "v1.iv.ciphertext.tag" dengan key eksplisit (bukan env). */
function decryptWith(payload: string, key: Buffer): string {
  const [version, ivB64, dataB64, tagB64] = payload.split(".");
  if (version !== "v1" || !ivB64 || !dataB64 || !tagB64) {
    throw new Error("Format ciphertext tidak valid");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Cek apakah payload ini sudah terenkripsi dengan `key` (auth tag cocok). */
function decryptsWith(payload: string, key: Buffer): boolean {
  try {
    decryptWith(payload, key);
    return true;
  } catch {
    // Gagal auth tag (key salah) atau format rusak — pemanggil membedakan via
    // decryptWith yang melempar; di sini cukup "bisa tidak".
    return false;
  }
}

/** Encrypt plaintext → "v1.iv.ciphertext.tag" dengan key eksplisit. */
function encryptWith(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ivB64 = iv.toString("base64url");
  const dataB64 = encrypted.toString("base64url");
  const tagB64 = tag.toString("base64url");
  return `v1.${ivB64}.${dataB64}.${tagB64}`;
}

const args = process.argv.slice(2);
const doApply = args.includes("--apply");
const doVerify = args.includes("--verify");

type Row = { id: string; value: string | null };

/** Mode --verify: pastikan SEMUA row sudah decryptable dengan key baru saja. */
async function verify(newKey: Buffer): Promise<void> {
  let checked = 0;
  let stillOld = 0;
  const staleDetails: string[] = [];

  for (const { table, column } of ENCRYPTED_COLUMNS) {
    const tbl = sql.identifier(table);
    const col = sql.identifier(column);
    const rows = (await db.execute<Row>(sql`
      select id, ${col} as value from ${tbl}
      where ${col} is not null and ${col} <> ''
    `)) as unknown as Row[];

    for (const row of rows) {
      if (!row.value) continue;
      checked += 1;
      if (!decryptsWith(row.value, newKey)) {
        stillOld += 1;
        staleDetails.push(`${table}.${column} id=${row.id}`);
      }
    }
  }

  console.log(`Verifikasi: ${checked} baris diperiksa, ${stillOld} masih pakai key lama.`);
  for (const detail of staleDetails) {
    console.warn(`  [stale] ${detail}`);
  }
  if (stillOld > 0) {
    console.error(
      "\nBELUM aman menghapus ENCRYPTION_KEY_OLD — jalankan --apply dulu " +
        "(ROTATE_OLD_KEY=<lama> ROTATE_NEW_KEY=<baru> bun run db:rotate-key --apply).",
    );
    process.exit(1);
  }
  console.log("\nAman: semua row sudah pakai key baru. Hapus ENCRYPTION_KEY_OLD lalu restart.");
  process.exit(0);
}

async function main(): Promise<void> {
  const oldKey = parseKey(process.env.ROTATE_OLD_KEY, "ROTATE_OLD_KEY");
  const newKey = parseKey(process.env.ROTATE_NEW_KEY, "ROTATE_NEW_KEY");
  if (Buffer.compare(oldKey, newKey) === 0) {
    throw new Error("ROTATE_NEW_KEY identik dengan ROTATE_OLD_KEY — tidak ada yang dirotasi");
  }

  if (doVerify) {
    await verify(newKey);
    return;
  }

  console.log(doApply ? "MODE: APPLY (transaksi)" : "MODE: DRY-RUN (tidak menulis)");

  let totalRows = 0;
  let totalRotated = 0;
  const summary: string[] = [];

  for (const { table, column } of ENCRYPTED_COLUMNS) {
    // sql.identifier dipisah ke variabel dulu — interpolasi template literal
    // hanya boleh referensi sederhana agar tetap jelas terbaca.
    const tbl = sql.identifier(table);
    const col = sql.identifier(column);

    const rows = (await db.execute<Row>(sql`
      select id, ${col} as value from ${tbl}
      where ${col} is not null and ${col} <> ''
    `)) as unknown as Row[];

    let rotated = 0;
    let alreadyNew = 0;
    let skipped = 0;
    const updates: Array<{ id: string; newValue: string }> = [];

    for (const row of rows) {
      if (!row.value) continue;
      // Cek key BARU dulu — row mungkin sudah dirotasi (write baru pas dual-key
      // aktif, atau ini re-run script). Idempoten: hitung sebagai "sudah baru",
      // bukan skip/korup. Tanpa ini setiap re-run melaporkan baris sehat sebagai
      // "tidak bisa didecrypt key lama".
      if (decryptsWith(row.value, newKey)) {
        alreadyNew += 1;
        continue;
      }
      let plaintext: string;
      try {
        plaintext = decryptWith(row.value, oldKey);
      } catch (error) {
        // Bukan key lama dan bukan key baru → dipakai key lain (rotasi parsial
        // sebelumnya?) atau korup. Lewati + laporkan — jangan abort seluruh
        // rotasi karena 1 baris aneh.
        skipped += 1;
        const msg = (error as Error).message;
        console.warn(
          `  [skip] ${table}.${column} id=${row.id} tidak bisa didecrypt key lama: ${msg}`,
        );
        continue;
      }
      updates.push({ id: row.id, newValue: encryptWith(plaintext, newKey) });
      rotated += 1;
    }

    totalRows += rows.length;
    totalRotated += rotated;
    const extra = [
      alreadyNew ? `${alreadyNew} sudah key baru` : "",
      skipped ? `${skipped} skip` : "",
    ]
      .filter(Boolean)
      .join(", ");
    const extraNote = extra ? ` (${extra})` : "";
    summary.push(`${table}.${column}: ${rows.length} baris, ${rotated} dirotasi${extraNote}`);

    if (doApply && updates.length > 0) {
      await db.transaction(async (tx) => {
        for (const { id, newValue } of updates) {
          await tx.execute(sql`
            update ${tbl} set ${col} = ${newValue} where id = ${id}
          `);
        }
      });
      // Verifikasi: sample pertama harus bisa didecrypt dengan key baru.
      const sample = updates[0];
      if (!sample) continue;
      const verified = (await db.execute<Row>(sql`
        select ${col} as value from ${tbl} where id = ${sample.id}
      `)) as unknown as Row[];
      const sampleValue = verified[0]?.value;
      if (sampleValue) decryptWith(sampleValue, newKey);
    }
  }

  console.log("\nRingkasan:");
  for (const line of summary) console.log(`  ${line}`);
  console.log(`\nTotal: ${totalRows} baris diperiksa, ${totalRotated} dirotasi.`);
  if (!doApply) {
    console.log(
      "\nDry-run — tidak ada yang ditulis. Jalankan dengan --apply untuk rotasi sungguhan.",
    );
  } else {
    console.log(
      "\nSelesai. Verifikasi dengan --verify, lalu hapus ENCRYPTION_KEY_OLD dan restart service.",
    );
  }
  process.exit(0);
}

main().catch((error) => {
  console.error("Rotasi gagal:", error);
  process.exit(1);
});
