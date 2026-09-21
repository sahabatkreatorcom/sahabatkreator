// Enkripsi AES-256-GCM — salinan identik packages/publishing/src/crypto.ts
// (package db dipakai server & worker; keduanya share ENCRYPTION_KEY root env)
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY belum diset di root .env (generate: openssl rand -base64 32)");
  }
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY harus 32-byte, dalam base64 atau hex (openssl rand -base64 32)",
    );
  }
  return key;
}

/** Enkripsi plaintext → "v1.iv.ciphertext" (base64url) */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${encrypted.toString("base64url")}.${tag.toString("base64url")}`;
}

/** Dekripsi "v1.iv.ciphertext.tag" → plaintext */
export function decrypt(payload: string): string {
  const [version, ivB64, dataB64, tagB64] = payload.split(".");
  if (version !== "v1" || !ivB64 || !dataB64 || !tagB64) {
    throw new Error("Format ciphertext tidak valid");
  }
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
