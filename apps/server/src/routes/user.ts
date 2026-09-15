// API User — hak data pribadi (UU PDP): ekspor + hapus akun + sesi perangkat

import { auth } from "@sahabatkreator/auth";
import { db } from "@sahabatkreator/db";
import {
  media as mediaTable,
  member,
  organization,
  post,
  postGroup,
  product,
  session as sessionTable,
  socialAccount,
  user as userTable,
} from "@sahabatkreator/db/schema";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { logAdminAction } from "../lib/audit";
import { errorResponse, getAuthContext } from "../lib/auth-guard";
import { deleteObject, isStorageConfigured } from "../lib/r2";

export const userRoute = new Hono();

/** Org milik user (untuk scope export/hapus data) */
async function userOrgIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId));
  return rows.map((r) => r.organizationId);
}

// ---------------------------------------------------------------------------
// Sesi perangkat aktif — list + revoke
// ---------------------------------------------------------------------------

/**
 * GET /user/sessions — daftar sesi perangkat user.
 * Token session TIDAK dikirim ke client (sensitif — itu kredensial cookie);
 * revoke berbasis row id, token dicari ulang di server.
 */
userRoute.get("/sessions", async (c) => {
  try {
    const ctx = await getAuthContext(c);
    if (!ctx) return c.json({ message: "Tidak terautentikasi" }, 401);

    const currentSession = await auth.api.getSession({ headers: c.req.raw.headers });

    const rows = await db
      .select({
        id: sessionTable.id,
        token: sessionTable.token,
        userAgent: sessionTable.userAgent,
        ipAddress: sessionTable.ipAddress,
        createdAt: sessionTable.createdAt,
        expiresAt: sessionTable.expiresAt,
      })
      .from(sessionTable)
      .where(and(eq(sessionTable.userId, ctx.user.id), gt(sessionTable.expiresAt, new Date())))
      .orderBy(desc(sessionTable.createdAt));

    return c.json({
      sessions: rows.map((s) => ({
        id: s.id,
        userAgent: s.userAgent ?? "",
        ipAddress: s.ipAddress,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        current: currentSession?.session?.token === s.token,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /user/sessions/revoke — cabut sesi berdasarkan row id */
userRoute.post("/sessions/revoke", async (c) => {
  try {
    const ctx = await getAuthContext(c);
    if (!ctx) return c.json({ message: "Tidak terautentikasi" }, 401);

    const { id } = z.object({ id: z.string().min(1) }).parse(await c.req.json());

    // Pastikan sesi milik user ini lalu ambil token untuk revoke via better-auth
    const [target] = await db
      .select({ token: sessionTable.token })
      .from(sessionTable)
      .where(and(eq(sessionTable.id, id), eq(sessionTable.userId, ctx.user.id)))
      .limit(1);
    if (!target) return c.json({ message: "Sesi tidak ditemukan" }, 404);

    await auth.api.revokeSession({ headers: c.req.raw.headers, body: { token: target.token } });

    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /user/sessions/revoke-others — cabut semua sesi kecuali sesi ini */
userRoute.post("/sessions/revoke-others", async (c) => {
  try {
    const ctx = await getAuthContext(c);
    if (!ctx) return c.json({ message: "Tidak terautentikasi" }, 401);

    await auth.api.revokeOtherSessions({ headers: c.req.raw.headers });

    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * GET /user/export-data — ekspor seluruh data user (hak akses UU PDP).
 * Format JSON: profil, keanggotaan org, post, media (metadata), produk.
 * Token & secret TIDAK diekspor (sensitif).
 */
userRoute.get("/export-data", async (c) => {
  try {
    const ctx = await getAuthContext(c);
    if (!ctx) return c.json({ message: "Tidak terautentikasi" }, 401);

    const [profile] = await db
      .select({
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        emailVerified: userTable.emailVerified,
        twoFactorEnabled: userTable.twoFactorEnabled,
        createdAt: userTable.createdAt,
      })
      .from(userTable)
      .where(eq(userTable.id, ctx.user.id))
      .limit(1);

    const orgIds = await userOrgIds(ctx.user.id);

    const memberships = await db
      .select({
        organizationId: member.organizationId,
        role: member.role,
        createdAt: member.createdAt,
      })
      .from(member)
      .where(eq(member.userId, ctx.user.id));

    const [orgs, posts, groups, media, products, accounts] = orgIds.length
      ? await Promise.all([
          db
            .select({ id: organization.id, name: organization.name, slug: organization.slug })
            .from(organization)
            .where(inArray(organization.id, orgIds)),
          db
            .select({
              id: post.id,
              platform: post.platform,
              status: post.status,
              content: post.content,
              createdAt: post.createdAt,
            })
            .from(post)
            .where(inArray(post.organizationId, orgIds))
            .limit(1000),
          db
            .select({
              id: postGroup.id,
              content: postGroup.content,
              scheduledAt: postGroup.scheduledAt,
              createdAt: postGroup.createdAt,
            })
            .from(postGroup)
            .where(inArray(postGroup.organizationId, orgIds))
            .limit(500),
          db
            .select({
              id: mediaTable.id,
              name: mediaTable.name,
              url: mediaTable.url,
              createdAt: mediaTable.createdAt,
            })
            .from(mediaTable)
            .where(inArray(mediaTable.organizationId, orgIds))
            .limit(1000),
          db
            .select({
              id: product.id,
              name: product.name,
              price: product.price,
              createdAt: product.createdAt,
            })
            .from(product)
            .where(inArray(product.organizationId, orgIds))
            .limit(500),
          db
            .select({
              id: socialAccount.id,
              platform: socialAccount.platform,
              username: socialAccount.username,
              createdAt: socialAccount.createdAt,
            })
            .from(socialAccount)
            .where(inArray(socialAccount.organizationId, orgIds)),
        ])
      : [[], [], [], [], [], []];

    // Audit: permintaan ekspor data (kepatuhan UU PDP)
    logAdminAction(c, ctx.user.id, {
      action: "user.export_data",
      entityType: "user",
      entityId: ctx.user.id,
      metadata: { orgCount: orgIds.length },
    });

    return c.json({
      exportedAt: new Date().toISOString(),
      profile,
      memberships,
      organizations: orgs,
      data: { posts, postGroups: groups, media, products, socialAccounts: accounts },
      note: "Token akses & kredensial platform tidak disertakan demi keamanan. Media asli dapat diunduh dari field url.",
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * POST /user/delete-account — hapus akun sendiri (hak penghapusan UU PDP).
 * - Org yang hanya beranggotakan user ini ikut dihapus (cascade).
 * - Org dengan anggota lain tetap hidup — keanggotaan user dicabut.
 * - Media R2 milik org yang dihapus di-clean up.
 * - Konten yang sudah tayang di platform sosial tidak terpengaruh.
 */
userRoute.post("/delete-account", async (c) => {
  try {
    const ctx = await getAuthContext(c);
    if (!ctx) return c.json({ message: "Tidak terautentikasi" }, 401);

    // Validasi konfirmasi ketik HAPUS (zod literal memastikan kehati-hatian user)
    z.object({ confirm: z.literal("HAPUS") }).parse(await c.req.json());

    // Org milik user
    const orgIds = await userOrgIds(ctx.user.id);

    // Org yang akan dihapus: yang member-nya hanya user ini
    const orgsToDelete: string[] = [];
    const orgsToKeep: string[] = [];
    for (const orgId of orgIds) {
      const membersInOrg = await db
        .select({ userId: member.userId })
        .from(member)
        .where(eq(member.organizationId, orgId));
      if (membersInOrg.length <= 1) {
        orgsToDelete.push(orgId);
      } else {
        orgsToKeep.push(orgId);
      }
    }

    // Cleanup media R2 milik org yang dihapus
    if (orgsToDelete.length > 0 && isStorageConfigured()) {
      const mediaRows = await db
        .select({ storageKey: mediaTable.storageKey })
        .from(mediaTable)
        .where(inArray(mediaTable.organizationId, orgsToDelete));
      for (const m of mediaRows) {
        await deleteObject(m.storageKey).catch(() => undefined);
      }
    }

    // Hapus org yang kosong (cascade: posts, media, produk, akun sosmed, dsb.)
    if (orgsToDelete.length > 0) {
      await db.delete(organization).where(inArray(organization.id, orgsToDelete));
    }

    // Cabut keanggotaan di org yang tetap hidup
    if (orgsToKeep.length > 0) {
      // Transfer ownership ke member lain bila user adalah owner terakhir
      // (better-auth mencegah hapus org ber-member; di sini cukup cabut membership)
      await db.delete(member).where(eq(member.userId, ctx.user.id));
    }

    // Hapus user via better-auth (session ikut ter-revoke)
    await auth.api.removeUser({
      body: { userId: ctx.user.id },
    });

    // Audit: rekam sebelum row user hilang — email disimpan di metadata
    // agar jejak tetap terbaca setelah FK user ter-set null
    logAdminAction(c, null, {
      action: "user.delete_account",
      entityType: "user",
      entityId: ctx.user.id,
      metadata: {
        email: ctx.user.email,
        deletedOrganizations: orgsToDelete.length,
        keptOrganizations: orgsToKeep.length,
      },
    });

    return c.json({
      ok: true,
      deletedOrganizations: orgsToDelete.length,
      keptOrganizations: orgsToKeep.length,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
