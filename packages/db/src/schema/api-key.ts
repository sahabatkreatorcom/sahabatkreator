// Schema domain API KEY — token creator untuk Public API (/v1).
//
// Token dikirim klien eksternal (curl, SDK, Zapier, MCP) sebagai
// `Authorization: Bearer sk_api_...`. Yang disimpan di DB hanyalah SHA-256
// dari token (tokenHash) + prefix pendek untuk tampilan/diagnosis — plaintext
// hanya dikembalikan SATU KALI saat pembuatan, sama seperti pola
// report_share.token (link sekali-lihat).
//
// Ikatan ke organization BUKAN user: seluruh guard internal (requireOrg)
// berbasis org, jadi key mewakili organisasi. Role pembuat di-resolve LIVE
// dari tabel member pada tiap request — pembuat dikeluarkan dari org → key
// ikut tidak berlaku.
import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { organization } from "./organization";
import { developerApp } from "./social";

/** Scope per resource group: `<resource>:read` / `<resource>:write`. */
export type ApiKeyScope =
  | "accounts:read"
  // Connect akun sosial lewat API (bridge gaya Repliz) — RFC rfc-oauth-connect.md.
  // Scope baru, jadi key lama tidak terpengaruh (aditif).
  | "accounts:write"
  | "analytics:read"
  | "ai:read"
  | "ai:write"
  | "automation:read"
  | "automation:write"
  | "media:read"
  | "media:write"
  | "posts:read"
  | "posts:write"
  | "renders:read"
  | "renders:write"
  | "reports:read"
  | "webhooks:read"
  | "webhooks:write";

/** Seluruh scope yang bisa diminta saat membuat key. */
export const API_KEY_SCOPES: ApiKeyScope[] = [
  "accounts:read",
  "accounts:write",
  "analytics:read",
  "ai:read",
  "ai:write",
  "automation:read",
  "automation:write",
  "media:read",
  "media:write",
  "posts:read",
  "posts:write",
  "renders:read",
  "renders:write",
  "reports:read",
  "webhooks:read",
  "webhooks:write",
];

export function isApiKeyScope(value: string): value is ApiKeyScope {
  return (API_KEY_SCOPES as string[]).includes(value);
}

export const apiKey = pgTable(
  "api_key",
  {
    id: text("id").primaryKey(),
    // Key selalu milik satu org — scope datanya sama dengan guard internal
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // App developer pemilik key (jalur API connect akun, RFC rfc-oauth-connect.md).
    // NULL = key biasa buatan Settings → API. Cascade: app dihapus → key-nya ikut
    // mati (tidak ada key yang menggantung tanpa pemilik allowlist redirect).
    developerAppId: text("developer_app_id").references(() => developerApp.id, {
      onDelete: "cascade",
    }),
    // Pembuat (untuk audit & resolusi role). Cascade: akun dihapus → key ikut
    // hilang, sejalan dengan alur penghapusan data wajib (UU PDP).
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Label bebas ("Zapier", "Dashboard Klien X") — bukan secret
    name: text("name").notNull(),
    // Prefix tampilan "sk_api_ab12" — cukup untuk dikenali di UI/log tanpa
    // membocorkan token
    tokenPrefix: text("token_prefix").notNull(),
    // SHA-256(token, "hex") — unik global, satu-satunya salinan token di DB
    tokenHash: text("token_hash").notNull(),
    // Scope yang diberikan pada key (bisa kosong = hanya endpoint read umum)
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at"),
    // Ditulis fire-and-forget — tidak boleh blocking request
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("api_key_hash_uidx").on(table.tokenHash),
    index("api_key_prefix_idx").on(table.tokenPrefix),
    index("api_key_organization_idx").on(table.organizationId),
  ],
);
