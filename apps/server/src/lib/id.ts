// ID generator dengan prefix — semua ID internal pakai prefix sk_ (kecuali ID dari better-auth)
import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** ID pendek url-safe, contoh: sk_post_x7fk2p9q */
export function generateId(entity: string): string {
  const bytes = randomBytes(10);
  let id = "";
  for (const byte of bytes) {
    id += ALPHABET[byte % ALPHABET.length];
  }
  return `sk_${entity}_${id}`;
}

/** Order ID untuk pembayaran Sumopod: sk_INV-<tanggal>-<random> */
export function generateOrderId(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, "0");
  const d = `${now.getDate()}`.padStart(2, "0");
  const rand = randomBytes(4).toString("hex");
  return `sk_INV-${y}${m}${d}-${rand}`;
}
