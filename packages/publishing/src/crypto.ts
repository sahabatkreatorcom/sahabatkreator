// Enkripsi AES-256-GCM — salinan identik apps/server/src/lib/crypto.ts
// (package publishing dipakai server & worker; keduanya share ENCRYPTION_KEY
// root env). Dukungan dual-key (ENCRYPTION_KEY_OLD fallback decrypt) untuk
// rotasi zero-downtime — lihat header apps/server/src/lib/crypto.ts.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function parseKey(raw: string | undefined, name: string): Buffer | null {
  if (!raw) return null;
  // Terima base64 (openssl rand -base64 32) atau hex 64-char (32-byte)
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`${name} harus 32-byte, dalam base64 atau hex (openssl rand -base64 32)`);
  }
  return key;
}

/** Key utama — WAJIB. Dipakai untuk encrypt dan decrypt. */
function getKey(): Buffer {
  const key = parseKey(process.env.ENCRYPTION_KEY, "ENCRYPTION_KEY");
  if (!key) {
    throw new Error("ENCRYPTION_KEY belum diset di root .env (generate: openssl rand -base64 32)");
  }
  return key;
}

/** Key lama — OPSIONAL, hanya fallback decrypt (lihat apps/server crypto.ts). */
function getOldKey(): Buffer | null {
  return parseKey(process.env.ENCRYPTION_KEY_OLD, "ENCRYPTION_KEY_OLD");
}

/** Enkripsi plaintext → "v1.iv.ciphertext.tag" (base64url). Selalu pakai key utama. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${encrypted.toString("base64url")}.${tag.toString("base64url")}`;
}

/** Dekripsi "v1.iv.ciphertext.tag" → plaintext. Coba key utama, lalu key lama. */
export function decrypt(payload: string): string {
  const [version, ivB64, dataB64, tagB64] = payload.split(".");
  if (version !== "v1" || !ivB64 || !dataB64 || !tagB64) {
    throw new Error("Format ciphertext tidak valid");
  }
  const iv = Buffer.from(ivB64, "base64url");
  const data = Buffer.from(dataB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");

  try {
    return decryptWith(getKey(), iv, data, tag);
  } catch (primaryError) {
    // Key utama gagal authenticate → mungkin ciphertext era key lama (window
    // rotasi). Coba fallback kalau dikonfigurasi; kalau tidak ada, lempar error
    // key utama (pesan asli yang akurat — bukan error fallback yang membingungkan).
    const oldKey = getOldKey();
    if (!oldKey) throw primaryError;
    return decryptWith(oldKey, iv, data, tag);
  }
}

function decryptWith(key: Buffer, iv: Buffer, data: Buffer, tag: Buffer): string {
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
