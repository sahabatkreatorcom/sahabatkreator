// Token creator untuk Public API (/v1).
//
// Format token : sk_api_<32 char base64url>  (prefix lama `sk_live_` masih diterima — lihat di bawah)
// Disimpan di DB: HANYA SHA-256-nya (tokenHash) + prefix pendek (tokenPrefix)
// untuk tampilan. Plaintext dikembalikan satu kali saat create, tidak pernah
// lagi — sama seperti pola report_share.token.
//
// Resolusi context sengaja meniru getAuthContext() di auth-guard.ts: hasilnya
// berbentuk AuthContext sehingga seluruh guard lama (requireOrg,
// requirePermission, requireOrgAdmin) bisa dipakai tanpa perubahan.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@sahabatkreator/db";
import {
  type ApiKeyScope,
  apiKey as apiKeyTable,
  member,
  organization as organizationTable,
  user as userTable,
} from "@sahabatkreator/db/schema";
import { and, eq } from "drizzle-orm";
import type { AuthContext, SessionUser } from "./auth-guard";

/**
 * Prefix token public API — membedakannya dari secret lain di log.
 *
 * MENGAPA bukan `sk_live_`: prefix itu **identik dengan format Stripe live secret
 * key** (`sk_live_` + 24+ alfanumerik), sehingga GitHub secret scanning menandai
 * token kita sebagai "Stripe API Key" dan **menolak push**. `sk_api_` mengikuti
 * konvensi ID lain di repo (`sk_<tipe>_`: `sk_socacc_`, `sk_devapp_`, `sk_oauthpend_`).
 */
export const API_KEY_TOKEN_PREFIX = "sk_api_";

/**
 * Prefix lama yang MASIH diterima saat verifikasi.
 *
 * MENGAPA dipertahankan: `verifyApiKey` memeriksa prefix SEBELUM hashing, jadi
 * mengganti prefix saja akan membuat seluruh key yang sudah beredar balas 401 —
 * dan key lama hanya bisa diganti dengan membuat key baru. Transisinya harus
 * non-breaking. Entri ini boleh dihapus setelah tidak ada lagi baris `api_key`
 * yang `tokenPrefix`-nya memakai nilai lama.
 */
export const API_KEY_LEGACY_TOKEN_PREFIXES: readonly string[] = ["sk_live_"];

/** Prefix yang diterima verifikasi: yang baru + legacy transisi. */
const ACCEPTED_API_KEY_PREFIXES: readonly string[] = [
  API_KEY_TOKEN_PREFIX,
  ...API_KEY_LEGACY_TOKEN_PREFIXES,
];

/** Token = prefix + 32 char base64url (24 random bytes). */
const TOKEN_RANDOM_BYTES = 24;

/** Key runtime yang dibutuhkan middleware scope (dibaca via c.get("apiKey")). */
export type ApiKeyRuntime = {
  id: string;
  name: string;
  tokenPrefix: string;
  organizationId: string;
  scopes: string[];
  /**
   * App developer pemilik key (jalur connect akun lewat API).
   * NULL = key biasa buatan Settings → API, yang tidak punya allowlist redirect
   * dan karena itu tidak boleh memakai endpoint connect (RFC rfc-oauth-connect.md).
   */
  developerAppId: string | null;
};

export type ApiKeyAuth = {
  context: AuthContext;
  key: ApiKeyRuntime;
};

/** SHA-256 hex dari token plaintext. */
export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

/** Buat token baru. Return plaintext hanya untuk dikirim ke klien SEKALI. */
export function generateApiKey(): {
  plaintext: string;
  tokenPrefix: string;
  tokenHash: string;
} {
  const random = randomBytes(TOKEN_RANDOM_BYTES).toString("base64url").slice(0, 32);
  const plaintext = `${API_KEY_TOKEN_PREFIX}${random}`;
  return {
    plaintext,
    tokenPrefix: plaintext.slice(0, API_KEY_TOKEN_PREFIX.length + 4),
    tokenHash: hashApiKey(plaintext),
  };
}

/**
 * Ambil token mentah dari header `Authorization: Bearer <token>` ATAU
 * `X-API-Key: <token>`. Return null bila tidak ada/format salah.
 */
export function extractApiKey(headers: Headers): string | null {
  const auth = headers.get("authorization");
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match?.[1]) return match[1].trim();
  }
  const custom = headers.get("x-api-key");
  if (custom?.trim()) return custom.trim();
  return null;
}

/** Perbandingan constant-time dua string hex (hindari timing oracle). */
function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verifikasi token lalu bangun AuthContext + ApiKeyRuntime.
 *
 * Return null bila token tidak dikenal, dicabut, kedaluwarsa, pembuatnya
 * di-banned, ATAU pembat bukan lagi anggota org (role di-resolve LIVE dari
 * tabel member — key mati otomatis saat pembuat dikeluarkan dari org).
 * Error DB DIPROPOGASI (bukan null) supaya tidak terbaca sebagai 401.
 */
export async function verifyApiKey(raw: string | null): Promise<ApiKeyAuth | null> {
  // Terima prefix baru DAN legacy (transisi, lihat API_KEY_LEGACY_TOKEN_PREFIXES).
  if (!raw || !ACCEPTED_API_KEY_PREFIXES.some((prefix) => raw.startsWith(prefix))) return null;

  const tokenHash = hashApiKey(raw);

  const [row] = await db
    .select()
    .from(apiKeyTable)
    .where(eq(apiKeyTable.tokenHash, tokenHash))
    .limit(1);

  // Index unique sudah menjamin ketepatan, tapi tetap bandingkan constant-time
  // agar tidak ada celah perbedaan respons.
  if (!row || !safeEqualHex(row.tokenHash, tokenHash)) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;

  const [userRow] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.id, row.createdBy))
    .limit(1);
  if (!userRow || userRow.banned) return null;

  const [memberRow] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.userId, row.createdBy), eq(member.organizationId, row.organizationId)))
    .limit(1);
  if (!memberRow) return null;

  const [orgRow] = await db
    .select({
      id: organizationTable.id,
      name: organizationTable.name,
      slug: organizationTable.slug,
      logo: organizationTable.logo,
    })
    .from(organizationTable)
    .where(eq(organizationTable.id, row.organizationId))
    .limit(1);
  if (!orgRow) return null;

  touchLastUsedAt(row.id, row.lastUsedAt);

  return {
    context: {
      user: toSessionUser(userRow),
      // Bukan session ID riil — penanda bahwa konteks berasal dari API key
      sessionId: `apikey_${row.id}`,
      organization: { ...orgRow, role: memberRow.role },
    },
    key: {
      id: row.id,
      name: row.name,
      tokenPrefix: row.tokenPrefix,
      organizationId: row.organizationId,
      scopes: row.scopes ?? [],
      developerAppId: row.developerAppId,
    },
  };
}

/**
 * Update lastUsedAt — fire-and-forget, dan hanya bila terakhir kali lebih dari
 * 1 menit lalu agar request API yang cepat tidak menulis satu baris UPDATE
 * per hit.
 */
function touchLastUsedAt(id: string, lastUsedAt: Date | null): void {
  if (lastUsedAt && Date.now() - lastUsedAt.getTime() < 60_000) return;
  void db
    .update(apiKeyTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeyTable.id, id))
    .catch(() => {
      // best-effort; request tetap jalan
    });
}

/** Row user tabel auth → bentuk SessionUser yang dipakai guard. */
function toSessionUser(row: {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: string | null;
  banned: boolean | null;
  lastActiveOrganizationId: string | null;
}): SessionUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    image: row.image,
    role: row.role,
    banned: row.banned,
    lastActiveOrganizationId: row.lastActiveOrganizationId,
  };
}

/** Cek satu scope pada key aktif. */
export function hasScope(key: ApiKeyRuntime, scope: ApiKeyScope): boolean {
  return key.scopes.includes(scope);
}
