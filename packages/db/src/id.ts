// ID generator dengan prefix sk_ — untuk packages/db (dipakai modul seb).
// Salinan identik apps/server/src/lib/id.ts (package db dipakai server & worker).
import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** ID pendek url-safe, contoh: sk_sebrec_x7fk2p9q */
export function generateId(entity: string): string {
  const bytes = randomBytes(10);
  let id = "";
  for (const byte of bytes) {
    id += ALPHABET[byte % ALPHABET.length];
  }
  return `sk_${entity}_${id}`;
}
