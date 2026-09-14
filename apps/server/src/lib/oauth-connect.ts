// Helper OAuth connect — pending seleksi entitas (Page Meta / profil LinkedIn) + upsert social account
// Digunakan oleh route oauth.ts (callback) dan accounts.ts (picker entitas)

import { db } from "@sahabatkreator/db";
import { type PendingPageData, socialAccount } from "@sahabatkreator/db/schema";
import { and, eq } from "drizzle-orm";
import { encrypt } from "./crypto";
import { generateId } from "./id";

/** TTL pending seleksi — 10 menit (kenapa: berisi token, jangan tinggal lama) */
export const OAUTH_PENDING_TTL_MS = 10 * 60 * 1000;

/** Bentuk mentah Page Meta dari fetchPlatformProfile / Graph API */
export type RawMetaPage = {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string };
};

/** Company LinkedIn tempat user ADMIN (dari fetchPlatformProfile extra.organizations) */
export type RawLinkedInOrganization = {
  id: string;
  name: string;
  vanityName?: string | null;
};

/**
 * Bangun data pending terenkripsi dari daftar Page Meta.
 * Setiap page token dienkripsi AES-256-GCM at-rest.
 */
export function buildPendingPages(platform: "instagram" | "facebook", pages: RawMetaPage[]) {
  const pagesData: PendingPageData[] = pages.map((p) => ({
    pageId: p.id,
    pageName: p.name,
    pageAccessTokenEnc: encrypt(p.access_token),
    igUserId: p.instagram_business_account?.id ?? null,
    igUsername: p.instagram_business_account?.username ?? null,
  }));
  return {
    id: generateId("oauthpend"),
    platform,
    pagesData: JSON.stringify(pagesData),
    expiresAt: new Date(Date.now() + OAUTH_PENDING_TTL_MS),
  };
}

/**
 * Bangun data pending LinkedIn (multi-company, note.md #15).
 * Opsi = profil pribadi + setiap company tempat user ADMIN.
 * LinkedIn tidak punya token per-company (semua pakai token user-level) —
 * token/refresh/expiry/scope disalin ke tiap entitas supaya select() seragam.
 */
export function buildPendingLinkedIn(params: {
  personSub: string;
  personName: string;
  organizations: RawLinkedInOrganization[];
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date | null;
  scopes: string[];
}) {
  const { personSub, personName, organizations, accessToken, refreshToken, expiresAt, scopes } =
    params;
  const shared = {
    pageAccessTokenEnc: encrypt(accessToken),
    refreshTokenEnc: refreshToken ? encrypt(refreshToken) : null,
    tokenExpiresAt: expiresAt ? expiresAt.toISOString() : null,
    scopes,
  };
  const pagesData: PendingPageData[] = [
    {
      pageId: `urn:li:person:${personSub}`,
      pageName: personName,
      igUserId: null,
      igUsername: null,
      ...shared,
    },
    ...organizations.map((org) => ({
      pageId: `urn:li:organization:${org.id}`,
      pageName: org.name,
      igUserId: null,
      igUsername: null,
      ...shared,
    })),
  ];
  return {
    id: generateId("oauthpend"),
    platform: "linkedin" as const,
    pagesData: JSON.stringify(pagesData),
    expiresAt: new Date(Date.now() + OAUTH_PENDING_TTL_MS),
  };
}

/**
 * Upsert social account dari entitas terpilih.
 * - instagram: pakai IG business account id sebagai platformAccountId (publish via IG Graph),
 *   simpan pageId + pageAccessToken di metadata (pola sama dengan fetchPlatformProfile)
 * - facebook: pakai page id, page access token langsung sebagai access token
 * - linkedin: pakai URN owner (urn:li:person:{sub} | urn:li:organization:{id}),
 *   access token = token user-level (LinkedIn tidak punya token per-company)
 *
 * Return { account, existing } — existing=true bila re-connect (update token).
 */
export async function upsertSocialAccount(params: {
  organizationId: string;
  userId: string;
  platform: "instagram" | "facebook" | "youtube" | "linkedin";
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

  if (platform === "linkedin") {
    platformAccountId = page.pageId; // URN lengkap person/organization
    username = page.pageName;
    accessTokenEnc = page.pageAccessTokenEnc; // token user-level (terenkripsi)
    metadata = {
      ownerType: page.pageId.startsWith("urn:li:organization:") ? "organization" : "person",
    };
    effectiveExpiresAt = page.tokenExpiresAt ? new Date(page.tokenExpiresAt) : null;
    effectiveScopes = page.scopes ?? scopes;
    refreshTokenEnc = page.refreshTokenEnc ?? null;
  } else {
    const isInstagram = platform === "instagram";
    platformAccountId = isInstagram ? (page.igUserId ?? page.pageId) : page.pageId;
    username = isInstagram ? (page.igUsername ?? page.pageName) : page.pageName;
    accessTokenEnc = page.pageAccessTokenEnc; // sudah terenkripsi
    metadata = {
      pageId: page.pageId,
      pageAccessToken: page.pageAccessTokenEnc, // terenkripsi at-rest (pola sama profil lama)
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
        accessTokenEnc,
        ...(refreshTokenEnc ? { refreshTokenEnc } : {}),
        tokenExpiresAt: effectiveExpiresAt,
        scopes: effectiveScopes,
        isConnected: true,
        needsReconnect: false,
        lastError: null,
        metadata,
        lastSyncedAt: new Date(),
      })
      .where(eq(socialAccount.id, existing.id));
    return { conflict: false as const, existing: true as const };
  }

  const id = generateId("socacc");
  await db.insert(socialAccount).values({
    id,
    organizationId,
    platform,
    platformAccountId,
    username,
    displayName: page.pageName,
    accessTokenEnc,
    refreshTokenEnc,
    tokenExpiresAt: effectiveExpiresAt,
    scopes: effectiveScopes,
    isConnected: true,
    metadata,
    lastSyncedAt: new Date(),
  });
  return { conflict: false as const, existing: false as const };
}
