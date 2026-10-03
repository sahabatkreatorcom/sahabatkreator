// Schema domain SOCIAL — akun social media terhubung + kredensial platform global
import { relations } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { platformEnum } from "./enum";
import { organization } from "./organization";

/**
 * Data entitas pilihan untuk picker multi-entity — disimpan terenkripsi di oauthPendingSelection.
 * Meta (FB/IG): entitas = Page; LinkedIn: entitas = profil pribadi / company;
 * Pinterest: entitas = board (platformAccountId = board_id tujuan publish);
 * YouTube: entitas = channel (platformAccountId = channelId tujuan upload).
 */
export type PendingPageData = {
  /** ID entitas (Page ID Facebook / URN LinkedIn / board ID Pinterest / channel ID YouTube) */
  pageId: string;
  /** Nama entitas (Page / profil / company / board / channel) */
  pageName: string;
  /** Token entitas (sudah terenkripsi AES-256-GCM). LinkedIn/Pinterest/YouTube: token user-level (sama untuk semua entitas) */
  pageAccessTokenEnc: string;
  /** IG business account id (null bila Page tidak punya IG bisnis) */
  igUserId: string | null;
  /** Username IG bisnis / username Pinterest (null bila tidak ada) */
  igUsername: string | null;
  /** Avatar entitas — profil IG (jalur instagram) atau foto Page (null bila tidak ada) */
  avatarUrl?: string | null;
  /** LinkedIn & YouTube saja: refresh token user-level (terenkripsi) */
  refreshTokenEnc?: string | null;
  /** LinkedIn & YouTube saja: expiry token user-level (ISO string) */
  tokenExpiresAt?: string | null;
  /** LinkedIn & YouTube saja: scope yang di-grant */
  scopes?: string[] | null;
  /** Flow bridge Repliz: page token = token Repliz, select → connect via bridge (bukan simpan token) */
  replizBridge?: boolean;
};

// Akun social media milik organization (hasil OAuth connect)
export const socialAccount = pgTable(
  "social_account",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    // ID akun di platform (mis. IG business account id, page id, handle)
    platformAccountId: text("platform_account_id").notNull(),
    username: text("username").notNull(),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    // Token dienkripsi AES-256-GCM sebelum disimpan
    accessTokenEnc: text("access_token_enc"),
    refreshTokenEnc: text("refresh_token_enc"),
    tokenExpiresAt: timestamp("token_expires_at"),
    scopes: jsonb("scopes").$type<string[]>(),
    // Untuk platform manual: catatan reminder saja
    isConnected: boolean("is_connected").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at"),
    // Tracking terpisah untuk sync DM (interval beda, tidak saling skip dgn engagement)
    lastDmSyncedAt: timestamp("last_dm_synced_at"),
    // Token expired & refresh gagal → user harus hubungkan ulang (dipasang worker token-refresh)
    needsReconnect: boolean("needs_reconnect").notNull().default(false),
    // Kapan akses platform terbukti hilang (token ditolak/dicabut) — jam mulai
    // untuk job retensi: data akun yang tidak bisa lagi dijaga kesegarannya
    // dihapus setelah masa tenggang (lihat packages/publishing/src/retention.ts).
    // SENGAJA terpisah dari updatedAt: kolom itu ikut berubah pada update apa pun
    // (lastSyncedAt, lastError), jadi jam retensinya bisa mundur tanpa sengaja.
    accessLostAt: timestamp("access_lost_at"),
    lastError: text("last_error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("social_account_platform_account_uidx").on(table.platform, table.platformAccountId),
    index("social_account_organizationId_idx").on(table.organizationId),
  ],
);

// Kredensial OAuth app milik platform (dikelola super admin, encrypted)
// Disimpan terpisah dari env agar bisa diubah via admin panel tanpa redeploy
export const platformCredential = pgTable(
  "platform_credential",
  {
    id: text("id").primaryKey(),
    platform: platformEnum("platform").notNull(),
    clientId: text("client_id").notNull(),
    clientSecretEnc: text("client_secret_enc").notNull(),
    // Redirect URI terdaftar di platform developer console
    redirectUri: text("redirect_uri"),
    // Config tambahan per platform (mis. app id, business id)
    extraConfigEnc: text("extra_config_enc"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("platform_credential_platform_uidx").on(table.platform)],
);

// Aplikasi developer pihak ketiga (Public API) — pemilik allowlist redirect.
// Dipisah dari api_key karena satu app logis bisa punya BEBERAPA key (rotasi),
// sementara allowlist redirect adalah properti APP, bukan properti key.
// Lihat docs/rfc-oauth-connect.md §6.1.
export const developerApp = pgTable(
  "developer_app",
  {
    id: text("id").primaryKey(), // sk_devapp_xxx
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Allowlist redirect URI — dicocokkan PERSIS (skema + host + path + port).
    // SENGAJA tanpa wildcard/prefix match: "https://app.dev" sebagai prefix akan
    // meloloskan "https://app.dev.evil.com" (open redirect).
    allowedRedirectUris: jsonb("allowed_redirect_uris").$type<string[]>().notNull().default([]),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("developer_app_organizationId_idx").on(table.organizationId)],
);

// State OAuth connect — CSRF protection + bind user/org (sekali pakai, TTL 10 menit)
export const oauthState = pgTable(
  "oauth_state",
  {
    id: text("id").primaryKey(),
    // Random state yang dikirim ke platform & dikembalikan via callback
    state: text("state").notNull(),
    platform: platformEnum("platform").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    // Jalur API (RFC connect akun): app developer pemilik flow.
    // NULL = flow dari UI Sahabat Kreator (jalur lama, tidak berubah).
    // Cascade: app dihapus saat flow masih jalan → state ikut hilang, flow batal
    // dengan pesan "state tidak valid" (perilaku yang benar, bukan state yatim).
    developerAppId: text("developer_app_id").references(() => developerApp.id, {
      onDelete: "cascade",
    }),
    // Tujuan akhir setelah callback SK (hanya jalur API). Nilainya WAJIB sudah
    // lolos allowlist developerApp.allowedRedirectUris sebelum baris ini ditulis.
    redirectUri: text("redirect_uri"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("oauth_state_state_uidx").on(table.state),
    index("oauth_state_expiresAt_idx").on(table.expiresAt),
  ],
);

// Pending seleksi entitas multi-entity — hasil OAuth dengan > 1 entitas, user
// harus memilih mana yang dihubungkan (lihat halaman /accounts?pending=...)
// pagesData = JSON terenkripsi dari array PendingPageData (berisi token!)
export const oauthPendingSelection = pgTable(
  "oauth_pending_selection",
  {
    id: text("id").primaryKey(), // sk_oauthpend_xxx
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Org asal flow OAuth — akun akan dihubungkan ke org ini saat entitas dipilih
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Platform yang memicu flow (instagram | facebook | linkedin | linkedin_org | pinterest | youtube)
    platform: platformEnum("platform").notNull(),
    // JSON [{ pageId, pageName, pageAccessTokenEnc, igUserId, igUsername }] — dienkripsi at-rest
    pagesData: text("pages_data").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("oauth_pending_selection_userId_idx").on(table.userId),
    index("oauth_pending_selection_expiresAt_idx").on(table.expiresAt),
  ],
);

// Health/uptime tiap platform (untuk halaman status)
export const platformHealth = pgTable(
  "platform_health",
  {
    id: text("id").primaryKey(),
    platform: platformEnum("platform").notNull(),
    // operational | degraded | outage | unknown
    status: text("status").notNull().default("unknown"),
    message: text("message"),
    checkedAt: timestamp("checked_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("platform_health_platform_uidx").on(table.platform),
    index("platform_health_checkedAt_idx").on(table.checkedAt),
  ],
);

// Konfigurasi bridge pihak ketiga (Repliz) — publish sementara via API mereka
// selama akses API native platform belum disetujui. Satu row per provider.
// routing: platform → "repliz" (connect baru via Repliz) — default native.
// Akun yang sudah terhubung via bridge tetap bridge seumur hidup row-nya
// (routing via socialAccount.metadata.replizAccountId), jadi switch admin
// tidak memutus akun existing.
export const bridgeConfig = pgTable(
  "bridge_config",
  {
    id: text("id").primaryKey(),
    // "repliz" (provider tunggu — kolom ini untuk ekspansi provider lain)
    provider: text("provider").notNull(),
    accessKey: text("access_key").notNull(),
    // Secret terenkripsi AES-256-GCM (pola sama platformCredential.clientSecretEnc)
    secretEnc: text("secret_enc").notNull(),
    // Platform apa saja yang connect-flow baru-nya diarahkan ke bridge
    routing: jsonb("routing").$type<Record<string, string>>().default({}).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("bridge_config_provider_uidx").on(table.provider)],
);

export const socialAccountRelations = relations(socialAccount, ({ one }) => ({
  organization: one(organization, {
    fields: [socialAccount.organizationId],
    references: [organization.id],
  }),
}));
