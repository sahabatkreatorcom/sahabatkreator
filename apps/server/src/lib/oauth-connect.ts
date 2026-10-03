// Helper OAuth connect — pending seleksi entitas (Page Meta / profil LinkedIn) + upsert social account
// Digunakan oleh route oauth.ts (callback) dan accounts.ts (picker entitas)

import { db } from "@sahabatkreator/db";
import {
  oauthPendingSelection,
  type PendingPageData,
  socialAccount,
} from "@sahabatkreator/db/schema";
import {
  clearAccessLostPatch,
  type OAuthPlatform,
  type PlatformProfile,
  type ReplizAccount,
  replizConnectAccount,
  replizExchangeCode,
  replizGetAccount,
  replizGetFacebookPages,
  replizGetLinkedInOrganizations,
  replizGetYouTubeChannels,
  type TokenResult,
} from "@sahabatkreator/publishing";
import { and, eq } from "drizzle-orm";
import { fireActivity } from "./activity-log";
import { checkFeatureGate } from "./billing";
import { decrypt, encrypt } from "./crypto";
import { generateId } from "./id";

/** TTL pending seleksi — 10 menit (kenapa: berisi token, jangan tinggal lama) */
export const OAUTH_PENDING_TTL_MS = 10 * 60 * 1000;

/** Bentuk mentah Page Meta dari fetchPlatformProfile / Graph API */
export type RawMetaPage = {
  id: string;
  name: string;
  access_token: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: {
    id: string;
    username?: string;
    profile_picture_url?: string;
  };
};

/** Company LinkedIn tempat user ADMIN (dari fetchPlatformProfile extra.organizations) */
export type RawLinkedInOrganization = {
  id: string;
  name: string;
  vanityName?: string | null;
};

/** Channel YouTube milik akun Google (dari fetchPlatformProfile extra.channels) */
export type RawYouTubeChannel = {
  id: string;
  title: string;
  thumbnailUrl?: string | null;
};

/**
 * Bangun entri pending terenkripsi dari daftar Page Meta.
 * Setiap page token dienkripsi AES-256-GCM at-rest.
 *
 * Builder mengembalikan ARRAY, bukan baris siap-simpan: `id`, TTL, dan
 * serialisasi JSON dimiliki `createPendingSelection` supaya tidak diulang di
 * setiap pemanggil (dulu 6 tempat).
 */
export function buildPendingPages(pages: RawMetaPage[]): PendingPageData[] {
  return pages.map((p) => ({
    pageId: p.id,
    pageName: p.name,
    pageAccessTokenEnc: encrypt(p.access_token),
    igUserId: p.instagram_business_account?.id ?? null,
    igUsername: p.instagram_business_account?.username ?? null,
    // Instagram: avatar profil IG; Facebook: foto Page
    avatarUrl: p.instagram_business_account?.profile_picture_url ?? p.picture?.data?.url ?? null,
  }));
}

/**
 * Bangun data pending LinkedIn (multi-company, note.md #15).
 * Opsi = profil pribadi (bila ada) + setiap company tempat user ADMIN.
 * `person` kosong untuk platform `linkedin_org` (app Community Management API
 * tanpa `openid` → tidak ada profil person, hanya halaman company).
 * LinkedIn tidak punya token per-company (semua pakai token user-level) —
 * token/refresh/expiry/scope disalin ke tiap entitas supaya select() seragam.
 */
export function buildPendingLinkedIn(params: {
  person?: { sub: string; name: string };
  organizations: RawLinkedInOrganization[];
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date | null;
  scopes: string[];
}): PendingPageData[] {
  const { person, organizations, accessToken, refreshToken, expiresAt, scopes } = params;
  const shared = {
    pageAccessTokenEnc: encrypt(accessToken),
    refreshTokenEnc: refreshToken ? encrypt(refreshToken) : null,
    tokenExpiresAt: expiresAt ? expiresAt.toISOString() : null,
    scopes,
  };
  return [
    ...(person
      ? [
          {
            pageId: `urn:li:person:${person.sub}`,
            pageName: person.name,
            igUserId: null,
            igUsername: null,
            ...shared,
          },
        ]
      : []),
    ...organizations.map((org) => ({
      pageId: `urn:li:organization:${org.id}`,
      pageName: org.name,
      igUserId: null,
      igUsername: null,
      ...shared,
    })),
  ];
}

/**
 * Bangun entri pending Pinterest — entitas = board (publish butuh board_id
 * sebagai platformAccountId). Token user-level sama untuk semua board.
 */
export function buildPendingPinterest(params: {
  username: string;
  avatarUrl?: string | null;
  boards: Array<{ id: string; name: string; privacy?: string }>;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date | null;
  scopes: string[];
}): PendingPageData[] {
  const { username, avatarUrl, boards, accessToken, refreshToken, expiresAt, scopes } = params;
  return boards.map((board) => ({
    pageId: board.id,
    pageName: board.name,
    pageAccessTokenEnc: encrypt(accessToken),
    igUserId: null,
    igUsername: username, // username Pinterest (sama utk semua board)
    avatarUrl: avatarUrl ?? null, // foto profil akun Pinterest (sama utk semua board)
    refreshTokenEnc: refreshToken ? encrypt(refreshToken) : null,
    tokenExpiresAt: expiresAt ? expiresAt.toISOString() : null,
    scopes,
  }));
}

/**
 * Bangun data pending YouTube — entitas = channel (publish target = channel
 * yang diautentikasi oleh token). Token Google bersifat user-level: satu token
 * (plus refresh token, karena `access_type=offline`) berlaku untuk semua channel
 * akun itu → disalin ke tiap entitas, pola sama dengan LinkedIn.
 */
export function buildPendingYouTube(params: {
  channels: RawYouTubeChannel[];
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date | null;
  scopes: string[];
}): PendingPageData[] {
  const { channels, accessToken, refreshToken, expiresAt, scopes } = params;
  const accessTokenEnc = encrypt(accessToken);
  const refreshTokenEnc = refreshToken ? encrypt(refreshToken) : null;
  const tokenExpiresAt = expiresAt ? expiresAt.toISOString() : null;
  return channels.map((ch) => ({
    pageId: ch.id, // channelId — dipakai sebagai platformAccountId saat select
    pageName: ch.title,
    pageAccessTokenEnc: accessTokenEnc,
    igUserId: null,
    igUsername: null,
    avatarUrl: ch.thumbnailUrl ?? null,
    refreshTokenEnc,
    tokenExpiresAt,
    scopes,
  }));
}

/** Platform yang entitasnya boleh masuk baris `oauth_pending_selection`. */
export type PendingPlatform =
  | "instagram"
  | "facebook"
  | "youtube"
  | "linkedin"
  | "linkedin_org"
  | "pinterest";

/**
 * Aset yang boleh dilihat developer — SENGAJA tanpa token apa pun (RFC §7).
 *
 * SATU bentuk untuk dua endpoint: `POST /connect` (saat picker diperlukan) dan
 * `GET /pending/:id` mengembalikan daftar yang sama, supaya developer tidak
 * perlu memetakan dua bentuk berbeda untuk data yang sama (RFC §11 #7).
 *
 * `hasInstagram`/`isPersonal` ikut di sini karena keduanya BUKAN detail internal:
 * - `hasInstagram` (Meta): Page tanpa IG Business **tidak bisa dipilih** di flow
 *   Instagram. Tanpa field ini developer baru tahu setelah `select` gagal.
 * - `isPersonal` (LinkedIn): menentukan target publish (profil pribadi vs company).
 */
export type PendingAsset = {
  id: string;
  name: string;
  username: string | null;
  picture: string | null;
  /** Meta: Page punya Instagram Business tertaut (syarat bisa dipilih di flow instagram). */
  hasInstagram: boolean;
  /** LinkedIn: profil pribadi (`urn:li:person:`) vs halaman company. */
  isPersonal: boolean;
};

/**
 * Proyeksi pagesData → daftar aset publik. Token tetap di pagesData terenkripsi.
 *
 * `platform` dibutuhkan untuk menurunkan `isPersonal`: deteksinya bergantung pada
 * platform DAN prefix URN. Sebelumnya logika itu hidup di handler route, jadi
 * hanya `GET /pending/:id` yang punya field itu sementara `assets[]` di
 * `POST /connect` tidak — persis penyebab divergensi §11 #7.
 */
export function toPendingAssets(pagesData: PendingPageData[], platform: string): PendingAsset[] {
  return pagesData.map((p) => ({
    id: p.pageId,
    name: p.pageName,
    username: p.igUsername ?? null,
    picture: p.avatarUrl ?? null,
    hasInstagram: Boolean(p.igUserId),
    // Pertahanan ganda: flow `linkedin` sudah difilter hanya person dan
    // `linkedin_org` hanya organization (lihat repliz-callback), tapi pengecekan
    // URN tetap dilakukan supaya bentuk respons tidak bergantung pada pemanggil.
    isPersonal: platform === "linkedin" && p.pageId.startsWith("urn:li:person:"),
  }));
}

/** Waktu kedaluwarsa baris pending — dipisah agar bisa diuji tanpa DB. */
export function pendingExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + OAUTH_PENDING_TTL_MS);
}

/**
 * Simpan baris pending seleksi + kembalikan aset siap-pakai untuk picker.
 *
 * MENGAPA diekstrak: penulisan baris pending sebelumnya terduplikasi di callback
 * native (5 cabang, masing-masing mengulang `db.insert` + `expiresAt` + id) dan
 * di bridge Repliz — dan `/v1/connect` (fase 3) akan jadi salinan berikutnya.
 * Sekarang `id`, TTL, dan serialisasi pagesData hanya ada di satu tempat;
 * builder cukup mengembalikan daftar entitas.
 */
export async function createPendingSelection(params: {
  platform: PendingPlatform;
  organizationId: string;
  userId: string;
  pagesData: PendingPageData[];
}): Promise<{ pendingId: string; assets: PendingAsset[] }> {
  const { platform, organizationId, userId, pagesData } = params;
  const pendingId = generateId("oauthpend");
  await db.insert(oauthPendingSelection).values({
    id: pendingId,
    userId,
    organizationId,
    platform,
    pagesData: JSON.stringify(pagesData),
    expiresAt: pendingExpiresAt(),
  });
  return { pendingId, assets: toPendingAssets(pagesData, platform) };
}

/**
 * Connect langsung dari profil OAuth — satu token, satu entitas, tanpa picker.
 * Dipakai untuk platform yang tidak punya/memilih entitas, termasuk platform di
 * luar enam platform picker (tiktok, threads, instagram_standalone, dll).
 *
 * `conflict` = akun platform yang sama sudah terhubung di organisasi LAIN;
 * satu akun platform hanya boleh dimiliki satu org supaya publish tidak bentrok.
 */
export async function connectFromProfile(params: {
  platform: OAuthPlatform;
  profile: PlatformProfile;
  token: TokenResult;
  organizationId: string;
  userId: string;
}): Promise<{ kind: "connected"; accountId: string } | { kind: "conflict" }> {
  const { platform, profile, token, organizationId, userId } = params;

  const [existing] = await db
    .select({ id: socialAccount.id, organizationId: socialAccount.organizationId })
    .from(socialAccount)
    .where(
      and(
        eq(socialAccount.platform, platform),
        eq(socialAccount.platformAccountId, profile.platformAccountId),
      ),
    )
    .limit(1);

  const accessTokenEnc = encrypt(token.accessToken);
  const refreshTokenEnc = token.refreshToken ? encrypt(token.refreshToken) : null;

  if (existing) {
    if (existing.organizationId !== organizationId) return { kind: "conflict" };
    // Re-connect: update token & profil (user re-grant setelah token expire/revoke)
    await db
      .update(socialAccount)
      .set({
        username: profile.username,
        displayName: profile.displayName ?? null,
        avatarUrl: profile.avatarUrl ?? null,
        accessTokenEnc,
        refreshTokenEnc,
        tokenExpiresAt: token.expiresAt ?? null,
        scopes: token.scopes,
        isConnected: true,
        // Sebelumnya flag `needsReconnect` TIDAK dibersihkan di sini, sehingga akun
        // yang berhasil dihubungkan ulang tetap tampil "Needs reconnection" di UI.
        // Patch ini sekaligus menghentikan jam retensi (accessLostAt → null).
        ...clearAccessLostPatch(),
        lastError: null,
        metadata: profile.extra ?? null,
        lastSyncedAt: new Date(),
      })
      .where(eq(socialAccount.id, existing.id));

    fireActivity({
      orgId: organizationId,
      userId,
      action: "account.reconnected",
      targetType: "social_account",
      targetId: existing.id,
      metadata: { platform, username: profile.username },
    });
    return { kind: "connected", accountId: existing.id };
  }

  // Gate limit akun (pool per-user) — throw 402, ditangani pemanggil.
  // Sengaja HANYA di cabang akun baru: reconnect tidak menambah pemakaian.
  await checkFeatureGate(organizationId, "social_accounts");
  const id = generateId("socacc");
  await db.insert(socialAccount).values({
    id,
    organizationId,
    platform,
    platformAccountId: profile.platformAccountId,
    username: profile.username,
    displayName: profile.displayName ?? null,
    avatarUrl: profile.avatarUrl ?? null,
    accessTokenEnc,
    refreshTokenEnc,
    tokenExpiresAt: token.expiresAt ?? null,
    scopes: token.scopes,
    isConnected: true,
    metadata: profile.extra ?? null,
    lastSyncedAt: new Date(),
  });

  fireActivity({
    orgId: organizationId,
    userId,
    action: "account.connected",
    targetType: "social_account",
    targetId: id,
    metadata: { platform, username: profile.username },
  });
  return { kind: "connected", accountId: id };
}

export type BuildPendingResult =
  | { kind: "pending"; pendingId: string; assets: PendingAsset[] }
  | { kind: "connected"; accountId: string }
  | { kind: "conflict" }
  | { kind: "error"; message: string };

/**
 * Satu tempat untuk keputusan "token → perlu picker, atau langsung connect".
 *
 * Dipakai callback native dan (fase 3) `POST /v1/accounts/:platform/connect`.
 *
 * MENGAPA jalur bridge Repliz TIDAK memakai fungsi ini: entitasnya datang dari
 * API Repliz (bukan `profile.extra` platform) dan token-nya token Repliz
 * per-entitas. Ia memakai `createPendingSelection` langsung — memaksakan satu
 * bentuk di sini hanya akan menyembunyikan perbedaan itu di balik percabangan.
 */
export async function buildPendingFromToken(params: {
  platform: OAuthPlatform;
  token: TokenResult;
  profile: PlatformProfile;
  organizationId: string;
  userId: string;
}): Promise<BuildPendingResult> {
  const { platform, token, profile, organizationId, userId } = params;
  const pendingCtx = { organizationId, userId };
  const tokenShared = {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: token.expiresAt,
    scopes: token.scopes,
  };

  // Meta (FB/IG) multi-Page → jangan auto-pilih; pages[0] bisa bukan Page yang
  // dimaksud user → salah akun publish.
  if (
    (platform === "instagram" || platform === "facebook") &&
    Array.isArray(profile.extra?.pages) &&
    (profile.extra.pages as RawMetaPage[]).length > 1
  ) {
    const pagesData = buildPendingPages(profile.extra.pages as RawMetaPage[]);
    return {
      kind: "pending",
      ...(await createPendingSelection({ platform, ...pendingCtx, pagesData })),
    };
  }

  // LinkedIn multi-entity: user ADMIN ≥ 1 company → pilih profil pribadi vs
  // company (posting sebagai company butuh scope org ter-approve). Tanpa
  // organizations (product belum approved) → lanjut auto-connect person.
  if (
    platform === "linkedin" &&
    Array.isArray(profile.extra?.organizations) &&
    (profile.extra.organizations as RawLinkedInOrganization[]).length > 0
  ) {
    const person = profile.extra.person as { sub: string; name: string } | undefined;
    const pagesData = buildPendingLinkedIn({
      person: person ? { sub: person.sub, name: person.name } : undefined,
      organizations: profile.extra.organizations as RawLinkedInOrganization[],
      ...tokenShared,
    });
    return {
      kind: "pending",
      ...(await createPendingSelection({ platform: "linkedin", ...pendingCtx, pagesData })),
    };
  }

  // LinkedIn company-only (app Community Management API). Flow ini TIDAK punya
  // profil person (app tanpa `openid`), jadi user selalu memilih company.
  if (platform === "linkedin_org") {
    const organizations = (profile.extra?.organizations ?? []) as RawLinkedInOrganization[];
    if (organizations.length === 0) {
      return {
        kind: "error",
        message: "Tidak ada halaman company LinkedIn yang bisa dihubungkan.",
      };
    }
    const pagesData = buildPendingLinkedIn({ organizations, ...tokenShared });
    return {
      kind: "pending",
      ...(await createPendingSelection({ platform: "linkedin_org", ...pendingCtx, pagesData })),
    };
  }

  // Pinterest: entitas = board (publish butuh board_id) → user pilih board.
  if (platform === "pinterest" && Array.isArray(profile.extra?.boards)) {
    const boards = profile.extra.boards as Array<{ id: string; name: string; privacy?: string }>;
    if (boards.length === 0) {
      return {
        kind: "error",
        message: "Akun Pinterest tidak memiliki board. Buat minimal satu board dulu di Pinterest.",
      };
    }
    const pagesData = buildPendingPinterest({
      username: profile.username,
      avatarUrl: profile.avatarUrl,
      boards,
      ...tokenShared,
    });
    return {
      kind: "pending",
      ...(await createPendingSelection({ platform: "pinterest", ...pendingCtx, pagesData })),
    };
  }

  // YouTube multi-channel: `channels?mine=true` mengembalikan semua channel milik
  // akun Google (termasuk brand account). Satu token = satu akun Google, jadi
  // >1 channel WAJIB dipilih user — tanpa ini user diam-diam tersambung ke
  // channel pertama. Channel tunggal → auto-connect di bawah.
  if (platform === "youtube") {
    const channels = (profile.extra?.channels ?? []) as RawYouTubeChannel[];
    if (channels.length > 1) {
      const pagesData = buildPendingYouTube({ channels, ...tokenShared });
      return {
        kind: "pending",
        ...(await createPendingSelection({ platform: "youtube", ...pendingCtx, pagesData })),
      };
    }
  }

  return connectFromProfile({ platform, profile, token, organizationId, userId });
}

/**
 * Upsert social account dari entitas terpilih.
 * - instagram: pakai IG business account id sebagai platformAccountId (publish via IG Graph),
 *   simpan pageId + pageAccessToken di metadata (pola sama dengan fetchPlatformProfile)
 * - facebook: pakai page id, page access token langsung sebagai access token
 * - linkedin: pakai URN owner (urn:li:person:{sub} | urn:li:organization:{id}),
 *   access token = token user-level (LinkedIn tidak punya token per-company)
 * - linkedin_org: sama seperti linkedin, tapi HANYA entitas organization
 *   (app Community Management API tanpa `openid` → tidak ada person)
 * - pinterest: pakai board id (publish butuh board_id), token user-level + RT rotating
 * - youtube: pakai channel id (target upload videos.insert), token user-level
 *   Google + refresh token (access_type=offline) — token sama untuk semua channel
 *
 * Return `{ conflict }` bila akun sudah terhubung di org lain, atau
 * `{ conflict: false, existing, accountId }` — `existing=true` bila re-connect
 * (update token). `accountId` dibutuhkan jalur API (`POST /v1/…/connect` dan
 * `pending/:id/select`) yang harus melaporkan ID akun ke developer.
 */
export async function upsertSocialAccount(params: {
  organizationId: string;
  userId: string;
  platform: "instagram" | "facebook" | "youtube" | "linkedin" | "linkedin_org" | "pinterest";
  page: PendingPageData;
  /** User access token fallback (dipakai facebook bila page token tak ada) */
  userAccessToken: string;
  tokenExpiresAt: Date | null;
  scopes: string[];
}) {
  const { organizationId, platform, page, userAccessToken, tokenExpiresAt, scopes } = params;

  let platformAccountId: string;
  let username: string;
  let accessTokenEnc: string;
  let metadata: Record<string, unknown>;
  let effectiveExpiresAt: Date | null;
  let effectiveScopes: string[];
  let refreshTokenEnc: string | null = null;

  if (platform === "linkedin" || platform === "linkedin_org") {
    platformAccountId = page.pageId; // URN lengkap person/organization
    username = page.pageName;
    accessTokenEnc = page.pageAccessTokenEnc; // token user-level (terenkripsi)
    metadata = {
      ownerType:
        platform === "linkedin_org" || page.pageId.startsWith("urn:li:organization:")
          ? "organization"
          : "person",
    };
    effectiveExpiresAt = page.tokenExpiresAt ? new Date(page.tokenExpiresAt) : null;
    effectiveScopes = page.scopes ?? scopes;
    refreshTokenEnc = page.refreshTokenEnc ?? null;
  } else if (platform === "pinterest") {
    platformAccountId = page.pageId; // board_id — target publish pin
    username = page.igUsername ?? page.pageName; // username akun Pinterest
    accessTokenEnc = page.pageAccessTokenEnc; // token user-level (terenkripsi)
    metadata = { boardId: page.pageId, boardName: page.pageName };
    effectiveExpiresAt = page.tokenExpiresAt ? new Date(page.tokenExpiresAt) : null;
    effectiveScopes = page.scopes ?? scopes;
    refreshTokenEnc = page.refreshTokenEnc ?? null; // RT rotating — persist setiap connect
  } else if (platform === "youtube") {
    platformAccountId = page.pageId; // channelId — target upload videos.insert
    username = page.pageName; // judul channel
    accessTokenEnc = page.pageAccessTokenEnc; // token user-level Google (terenkripsi)
    metadata = { channelId: page.pageId, channelTitle: page.pageName };
    effectiveExpiresAt = page.tokenExpiresAt ? new Date(page.tokenExpiresAt) : null;
    effectiveScopes = page.scopes ?? scopes;
    refreshTokenEnc = page.refreshTokenEnc ?? null; // offline → refresh token ada
  } else {
    const isInstagram = platform === "instagram";
    platformAccountId = isInstagram ? (page.igUserId ?? page.pageId) : page.pageId;
    username = isInstagram ? (page.igUsername ?? page.pageName) : page.pageName;
    accessTokenEnc = page.pageAccessTokenEnc; // sudah terenkripsi
    metadata = {
      pageId: page.pageId,
      // PLAINTEXT — konsumer (engagement-sync, dm-sync, reply, posts-sync)
      // memakai langsung sebagai access_token Graph. Pola sama jalur single-Page
      // (metadata = profile.extra, pageAccessToken plaintext).
      pageAccessToken: decrypt(page.pageAccessTokenEnc),
    };
    if (!isInstagram) metadata.userAccessToken = encrypt(userAccessToken);
    effectiveExpiresAt = tokenExpiresAt; // page token long-lived; expiry diurus worker token-refresh
    effectiveScopes = scopes;
  }

  const [existing] = await db
    .select({ id: socialAccount.id, organizationId: socialAccount.organizationId })
    .from(socialAccount)
    .where(
      and(
        eq(socialAccount.platform, platform),
        eq(socialAccount.platformAccountId, platformAccountId),
      ),
    )
    .limit(1);

  if (existing) {
    if (existing.organizationId !== organizationId) {
      return { conflict: true as const };
    }
    await db
      .update(socialAccount)
      .set({
        username,
        displayName: page.pageName,
        avatarUrl: page.avatarUrl ?? null,
        accessTokenEnc,
        ...(refreshTokenEnc ? { refreshTokenEnc } : {}),
        tokenExpiresAt: effectiveExpiresAt,
        scopes: effectiveScopes,
        isConnected: true,
        ...clearAccessLostPatch(),
        lastError: null,
        metadata,
        lastSyncedAt: new Date(),
      })
      .where(eq(socialAccount.id, existing.id));
    return { conflict: false as const, existing: true as const, accountId: existing.id };
  }

  const id = generateId("socacc");
  await db.insert(socialAccount).values({
    id,
    organizationId,
    platform,
    platformAccountId,
    username,
    displayName: page.pageName,
    avatarUrl: page.avatarUrl ?? null,
    accessTokenEnc,
    refreshTokenEnc,
    tokenExpiresAt: effectiveExpiresAt,
    scopes: effectiveScopes,
    isConnected: true,
    metadata,
    lastSyncedAt: new Date(),
  });
  return { conflict: false as const, existing: false as const, accountId: id };
}

// ── Bridge Repliz ────────────────────────────────────────────────────────────
// Connect lewat Repliz dipakai DUA pemanggil dengan kebutuhan berbeda:
//   - `routes/oauth/repliz-callback.ts` — jalur UI: hasilnya di-redirect ke WEB_URL
//   - `routes/oauth/connect.ts`         — jalur API: hasilnya jadi JSON polimorfik
// Karena itu logikanya duduk di sini (bukan di dalam satu handler), supaya kedua
// jalur tidak bercabang sendiri-sendiri saat routing bridge berubah.

/** Platform bridge yang `connect`-nya menerima `code` LANGSUNG, tanpa exchange. */
const REPLIZ_CODE_ONLY_PLATFORMS = new Set<string>([
  "instagram",
  "instagram_standalone",
  "threads",
  "tiktok",
]);

/** Platform bridge yang entitasnya harus dipilih user (Page / channel / company). */
const REPLIZ_PICKER_PLATFORMS = new Set<string>([
  "facebook",
  "youtube",
  "linkedin",
  "linkedin_org",
]);

/** Pesan saat platform picker tidak mengembalikan satu entitas pun. */
function emptyEntityMessage(platform: OAuthPlatform): string {
  if (platform === "facebook") return "Tidak ada Facebook Page yang bisa diakses akun ini";
  if (platform === "youtube") return "Tidak ada channel YouTube yang bisa diakses akun ini";
  if (platform === "linkedin_org") return "Tidak ada halaman company LinkedIn yang Anda admin";
  return "Tidak ada profil LinkedIn yang bisa dihubungkan";
}

/**
 * Simpan hasil connect Repliz (satu entitas) sebagai social_account.
 *
 * `metadata.replizAccountId` adalah penanda routing publish PER-AKUN: pipeline
 * memakainya untuk memilih Repliz Schedule API alih-alih adapter native. Token
 * platform TIDAK disimpan di sisi kita — Repliz yang memegangnya.
 */
async function upsertReplizFromInfo(params: {
  platform: OAuthPlatform;
  replizAccountId: string;
  info: ReplizAccount;
  organizationId: string;
  userId: string;
}): Promise<BuildPendingResult> {
  const { platform, replizAccountId, info, organizationId, userId } = params;

  const [existing] = await db
    .select({ id: socialAccount.id, organizationId: socialAccount.organizationId })
    .from(socialAccount)
    .where(
      and(
        eq(socialAccount.platform, platform),
        eq(socialAccount.platformAccountId, info.generatedId),
      ),
    )
    .limit(1);

  if (existing && existing.organizationId !== organizationId) return { kind: "conflict" };

  const values = {
    username: info.username ?? info.name,
    displayName: info.name,
    avatarUrl: info.picture ?? null,
    accessTokenEnc: null,
    refreshTokenEnc: null,
    tokenExpiresAt: null,
    isConnected: true,
    ...clearAccessLostPatch(),
    lastError: null,
    metadata: {
      replizAccountId,
      replizGeneratedId: info.generatedId,
    },
    lastSyncedAt: new Date(),
  };

  if (existing) {
    await db.update(socialAccount).set(values).where(eq(socialAccount.id, existing.id));
    fireActivity({
      orgId: organizationId,
      userId,
      action: "account.reconnected",
      targetType: "social_account",
      targetId: existing.id,
      metadata: { platform, username: info.username, via: "repliz" },
    });
    return { kind: "connected", accountId: existing.id };
  }

  // Gate limit akun (pool) — HANYA di cabang akun baru; reconnect tidak menambah pemakaian.
  await checkFeatureGate(organizationId, "social_accounts");
  const id = generateId("socacc");
  await db.insert(socialAccount).values({
    id,
    organizationId,
    platform,
    platformAccountId: info.generatedId,
    ...values,
  });
  fireActivity({
    orgId: organizationId,
    userId,
    action: "account.connected",
    targetType: "social_account",
    targetId: id,
    metadata: { platform, username: info.username, via: "repliz" },
  });
  return { kind: "connected", accountId: id };
}

/**
 * `code` dari halaman Repliz → akun terhubung, atau pending picker.
 *
 * Pola connect berbeda per platform (docs.repliz.com):
 *   - instagram / instagram_standalone / threads / tiktok → `connect({ code })`
 *     tanpa exchange (API Instagram Repliz tidak punya endpoint exchange; flow
 *     IG-page-picker native tidak punya padanannya di Repliz)
 *   - facebook / youtube / linkedin / linkedin_org → exchange → daftar entitas →
 *     picker. Token entitas Repliz per-entitas disimpan terenkripsi di pending.
 *   - sisanya → `connect({ code })` → akun
 *
 * MENGAPA bukan `buildPendingFromToken`: entitas bridge datang dari API Repliz,
 * bukan dari `profile.extra` platform, dan token-nya token Repliz per-entitas —
 * memaksakan satu bentuk di sana hanya akan menyembunyikan perbedaan itu.
 */
export async function connectViaRepliz(params: {
  platform: OAuthPlatform;
  code: string;
  organizationId: string;
  userId: string;
}): Promise<BuildPendingResult> {
  const { platform, code, organizationId, userId } = params;
  const { getReplizCredentials, toReplizPlatformKey } = await import("./bridge");
  const cred = await getReplizCredentials();
  const platformKey = toReplizPlatformKey(platform);
  if (!cred || !platformKey) {
    return { kind: "error", message: "Bridge Repliz tidak aktif — hubungi admin" };
  }

  if (REPLIZ_CODE_ONLY_PLATFORMS.has(platform)) {
    const replizAccountId = await replizConnectAccount(cred, platformKey, { code });
    const info = await replizGetAccount(cred, replizAccountId);
    return upsertReplizFromInfo({ platform, replizAccountId, info, organizationId, userId });
  }

  const token = await replizExchangeCode(cred, platformKey, code);

  if (REPLIZ_PICKER_PLATFORMS.has(platform)) {
    // `/public/account/linkedin/organization` mengembalikan personal
    // (urn:li:person:) + company (urn:li:organization:) sekaligus. Native
    // memisahkan keduanya (app berbeda) — bridge harus konsisten dengan flow
    // yang dimulai user, jadi filternya mengikuti platform.
    const raw =
      platform === "facebook"
        ? await replizGetFacebookPages(cred, token)
        : platform === "youtube"
          ? await replizGetYouTubeChannels(cred, token)
          : await replizGetLinkedInOrganizations(cred, token);
    const entities =
      platform === "linkedin"
        ? raw.filter((p) => p.id.startsWith("urn:li:person:"))
        : platform === "linkedin_org"
          ? raw.filter((p) => p.id.startsWith("urn:li:organization:"))
          : raw;
    if (entities.length === 0) return { kind: "error", message: emptyEntityMessage(platform) };

    const pagesData: PendingPageData[] = entities.map((p) => ({
      pageId: p.id, // FB pageId / YT channelId / LinkedIn URN
      pageName: p.name,
      pageAccessTokenEnc: encrypt(p.token), // token entitas Repliz, terenkripsi at-rest
      igUserId: null,
      igUsername: p.username ?? null,
      // `picture` dari Repliz (foto Page / thumbnail channel) → avatar picker.
      // Tanpa baris ini `toPendingAssets` selalu mengembalikan `picture: null`
      // untuk SELURUH platform bridge, jadi picker jatuh ke ikon generik.
      avatarUrl: p.picture ?? null,
      // Marker flow bridge — `pending/:id/select` mendeteksi ini untuk connect
      // lewat Repliz alih-alih adapter native.
      replizBridge: true,
    }));
    return {
      kind: "pending",
      ...(await createPendingSelection({
        // Keempat isi REPLIZ_PICKER_PLATFORMS semuanya anggota PendingPlatform.
        platform: platform as PendingPlatform,
        organizationId,
        userId,
        pagesData,
      })),
    };
  }

  const replizAccountId = await replizConnectAccount(cred, platformKey, { code });
  const info = await replizGetAccount(cred, replizAccountId);
  return upsertReplizFromInfo({ platform, replizAccountId, info, organizationId, userId });
}
