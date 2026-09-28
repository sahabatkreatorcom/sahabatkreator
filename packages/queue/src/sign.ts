// Signing webhook keluar — HMAC-SHA256 dengan secret per-endpoint.
//
// Secret disimpan terenkripsi (webhook_endpoint.secretEnc, ENCRYPTION_KEY),
// didekripsi hanya saat signing. Header x-sk-signature format
// "v1=<hex sha256>" — pelanggan verifikasi dengan timingSafeEqual,
// sama seperti verifySignature webhook-platform.ts:110.

import { createHmac, timingSafeEqual } from "node:crypto";
import { decrypt } from "@sahabatkreator/db";

/**
 * Tanda tangani body mentah dengan secret endpoint (ciphertext).
 * Return "v1=<hex>" — siap dipakai sebagai header x-sk-signature.
 */
export function signWebhookPayload(body: string, secretEnc: string): string {
  const secret = decrypt(secretEnc);
  const digest = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  return `v1=${digest}`;
}

/**
 * Verifikasi signature sisi klien (untuk test + dokumentasi contoh kode).
 * Bandingkan dengan timingSafeEqual — tidak pernah string ===.
 */
export function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  const raw = signature.startsWith("v1=") ? signature.slice(3) : signature;
  if (raw.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(raw, "hex"), Buffer.from(expected, "hex"));
}
