// API Admin — statistik platform, user & org management, plans, credentials, settings

import { auth } from "@sahabatkreator/auth";
import { db } from "@sahabatkreator/db";
import {
  member,
  organization,
  payment,
  socialAccount,
  subscription,
  user as userTable,
} from "@sahabatkreator/db/schema";
import { count, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { fireActivity } from "../lib/activity-log";
import { logAdminAction } from "../lib/audit";
import { errorResponse, requirePlatformAdmin } from "../lib/auth-guard";
import { generateId } from "../lib/id";

export const adminUsersRoute = new Hono();
/** GET /admin/stats — dashboard statistik platform */
adminUsersRoute.get("/stats", async (c) => {
  try {
    await requirePlatformAdmin(c);

    const [users] = await db.select({ total: count() }).from(userTable);
    const [orgs] = await db.select({ total: count() }).from(organization);
    const [accounts] = await db.select({ total: count() }).from(socialAccount);

    const [revenue] = await db
      .select({
        total: sql<number>`coalesce(sum(${payment.amount}), 0)::bigint`,
      })
      .from(payment)
      .where(eq(payment.status, "completed"));

    // Distribusi tier
    const tiers = await db
      .select({ tier: subscription.tier, total: count() })
      .from(subscription)
      .where(eq(subscription.status, "active"))
      .groupBy(subscription.tier);

    // User baru 30 hari
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const [newUsers] = await db
      .select({ total: count() })
      .from(userTable)
      .where(sql`${userTable.createdAt} >= ${since}`);

    return c.json({
      totalUsers: users?.total ?? 0,
      totalOrganizations: orgs?.total ?? 0,
      totalSocialAccounts: accounts?.total ?? 0,
      totalRevenue: Number(revenue?.total ?? 0),
      newUsers30d: newUsers?.total ?? 0,
      tierDistribution: tiers,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /admin/users — list user dengan paginasi */
adminUsersRoute.get("/users", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const page = Math.max(Number(c.req.query("page") ?? 1), 1);
    const perPage = Math.min(Number(c.req.query("perPage") ?? 20), 100);

    const users = await db
      .select({
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        emailVerified: userTable.emailVerified,
        image: userTable.image,
        role: userTable.role,
        banned: userTable.banned,
        banReason: userTable.banReason,
        banExpires: userTable.banExpires,
        twoFactorEnabled: userTable.twoFactorEnabled,
        createdAt: userTable.createdAt,
      })
      .from(userTable)
      .orderBy(desc(userTable.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage);

    const [total] = await db.select({ total: count() }).from(userTable);

    return c.json({ users, total: total?.total ?? 0, page, perPage });
  } catch (error) {
    return errorResponse(error);
  }
});

/** PATCH /admin/users/:id — set role / ban / unban */
adminUsersRoute.patch("/users/:id", async (c) => {
  try {
    const ctx = await requirePlatformAdmin(c);
    const input = z
      .object({
        role: z.enum(["user", "admin"]).optional(),
        ban: z.boolean().optional(),
        banReason: z.string().max(500).optional(),
      })
      .parse(await c.req.json());

    const targetId = c.req.param("id");
    if (targetId === ctx.user.id && input.ban) {
      return c.json({ message: "Tidak bisa ban diri sendiri" }, 400);
    }

    await db
      .update(userTable)
      .set({
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.ban !== undefined
          ? {
              banned: input.ban,
              banReason: input.ban ? (input.banReason ?? "Diblokir oleh admin") : null,
              banExpires: null,
            }
          : {}),
      })
      .where(eq(userTable.id, targetId));

    // Catat audit log
    logAdminAction(c, ctx.user.id, {
      action: input.ban !== undefined ? (input.ban ? "user.ban" : "user.unban") : "user.set_role",
      entityType: "user",
      entityId: targetId,
      metadata: { ...input },
    });

    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- Impersonate user (M13) ----------
// Admin "masuk sebagai" user org untuk debugging.
// Implementasi memakai fitur impersonation bawaan better-auth (plugin admin):
// - auth.api.impersonateUser membuat session baru utk user target dengan
//   kolom impersonatedBy = adminUserId (sudah ada di schema auth.ts), lalu
//   set cookie session + cookie admin_session (utk restore saat exit).
// - auth.api.stopImpersonating menghapus session impersonasi dan restore
//   cookie session admin. Karena cookie admin_session disimpan pihak
//   better-auth (bukan Map in-memory), exit tetap valid walau server restart.

/**
 * POST /admin/users/:id/impersonate — mulai sesi impersonasi.
 * Cookie session diganti ke user target; session admin asli disimpan di
 * cookie admin_session (ditangani better-auth) agar bisa dikembalikan.
 */
adminUsersRoute.post("/users/:id/impersonate", async (c) => {
  try {
    const ctx = await requirePlatformAdmin(c);
    const targetId = c.req.param("id");

    // Ambil user target untuk validasi + response
    const [target] = await db
      .select({
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        banned: userTable.banned,
      })
      .from(userTable)
      .where(eq(userTable.id, targetId))
      .limit(1);
    if (!target) return c.json({ message: "User tidak ditemukan" }, 404);
    if (target.banned) {
      return c.json({ message: "Tidak bisa impersonate user yang diblokir" }, 400);
    }
    if (target.id === ctx.user.id) {
      return c.json({ message: "Tidak bisa impersonate diri sendiri" }, 400);
    }

    // Panggil endpoint internal better-auth — memproses set-cookie pada
    // headers respons (asResponse: true agar header cookie ikut terbentuk).
    const res = await auth.api.impersonateUser({
      headers: c.req.raw.headers,
      body: { userId: targetId },
      asResponse: true,
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      return c.json(
        { message: body?.message ?? "Gagal memulai impersonasi" },
        res.status as 400 | 401 | 403 | 404 | 500,
      );
    }

    // Salin header set-cookie dari respons better-auth ke respons Hono
    // (nilai env cookie sama persis — diatur auth instance, bukan manual).
    const setCookies = res.headers.getSetCookie();
    for (const cookie of setCookies) {
      c.header("set-cookie", cookie, { append: true });
    }

    // Catat jejak impersonasi di audit log (aksi admin) + activity log
    // (aktivitas org user target, bila user punya org).
    logAdminAction(c, ctx.user.id, {
      action: "user.impersonate",
      entityType: "user",
      entityId: targetId,
      metadata: { targetEmail: target.email, targetName: target.name },
    });

    const [targetMembership] = await db
      .select({ organizationId: member.organizationId })
      .from(member)
      .where(eq(member.userId, targetId))
      .limit(1);
    if (targetMembership) {
      fireActivity({
        orgId: targetMembership.organizationId,
        userId: ctx.user.id,
        action: "admin.impersonation_started",
        targetType: "user",
        targetId: targetId,
        metadata: { adminEmail: ctx.user.email, targetEmail: target.email },
      });
    }

    return c.json({
      ok: true,
      targetUser: { id: target.id, name: target.name, email: target.email },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * POST /admin/impersonate/exit — keluar dari sesi impersonasi.
 * Valid bila session saat ini hasil impersonasi (kolom impersonatedBy terisi
 * di tabel session) — session admin dipulihkan dari cookie admin_session.
 */
adminUsersRoute.post("/impersonate/exit", async (c) => {
  try {
    // stopImpersonating membaca cookie session + admin_session dari headers
    // request; bila bukan sesi impersonasi → error dari better-auth.
    const res = await auth.api.stopImpersonating({
      headers: c.req.raw.headers,
      asResponse: true,
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      return c.json(
        { message: body?.message ?? "Gagal keluar dari impersonasi" },
        res.status as 400 | 401 | 403 | 404 | 500,
      );
    }

    const setCookies = res.headers.getSetCookie();
    for (const cookie of setCookies) {
      c.header("set-cookie", cookie, { append: true });
    }

    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * GET /admin/impersonate/status — cek apakah session cookie saat ini adalah
 * sesi impersonasi. Dipakai UI untuk menampilkan banner.
 * Tidak butuh requirePlatformAdmin: user biasa juga bisa cek (session
 * impersonasi selalu milik admin platform yang memulainya).
 */
adminUsersRoute.get("/impersonate/status", async (c) => {
  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    // impersonatedBy hanya terisi pada session buatan impersonateUser
    const impersonatedBy = (session?.session as { impersonatedBy?: string } | undefined)
      ?.impersonatedBy;

    if (!session || !impersonatedBy) {
      return c.json({ active: false, adminEmail: null, userEmail: null });
    }

    // Ambil email admin peng-impersonate utk ditampilkan di banner
    const [admin] = await db
      .select({ email: userTable.email })
      .from(userTable)
      .where(eq(userTable.id, impersonatedBy))
      .limit(1);

    return c.json({
      active: true,
      adminEmail: admin?.email ?? null,
      userEmail: session.user.email,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * POST /admin/users/:id/revoke-sessions — cabut SEMUA session aktif user.
 * Dipakai saat akun terindikasi dibajak: admin memaksa logout semua perangkat
 * (session token dihapus dari DB sehingga cookie client tidak lagi valid).
 * Menggunakan endpoint internal better-auth (plugin admin) yang sudah
 * memvalidasi ulang session admin pemanggil dari headers.
 */
adminUsersRoute.post("/users/:id/revoke-sessions", async (c) => {
  try {
    const ctx = await requirePlatformAdmin(c);
    const targetId = c.req.param("id");

    // Validasi user target ada — mencabut session user yang tidak ada
    // tidak bermakna dan kemungkinan salah ketik ID.
    const [target] = await db
      .select({ id: userTable.id, email: userTable.email })
      .from(userTable)
      .where(eq(userTable.id, targetId))
      .limit(1);
    if (!target) return c.json({ message: "User tidak ditemukan" }, 404);

    const result = await auth.api.revokeUserSessions({
      headers: c.req.raw.headers,
      body: { userId: targetId },
    });

    logAdminAction(c, ctx.user.id, {
      action: "user.revoke_sessions",
      entityType: "user",
      entityId: targetId,
      metadata: { targetEmail: target.email, success: result.success },
    });

    return c.json({ success: result.success });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /admin/organizations — list organization + tier + members */
adminUsersRoute.get("/organizations", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const page = Math.max(Number(c.req.query("page") ?? 1), 1);
    const perPage = Math.min(Number(c.req.query("perPage") ?? 20), 100);

    const orgs = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logo: organization.logo,
        createdAt: organization.createdAt,
        tier: subscription.tier,
        subscriptionStatus: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        memberCount: sql<number>`(select count(*)::int from ${member} where ${member.organizationId} = ${organization.id})`,
      })
      .from(organization)
      .leftJoin(subscription, eq(subscription.organizationId, organization.id))
      .orderBy(desc(organization.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage);

    const [total] = await db.select({ total: count() }).from(organization);

    return c.json({ organizations: orgs, total: total?.total ?? 0, page, perPage });
  } catch (error) {
    return errorResponse(error);
  }
});

/** PATCH /admin/organizations/:id — set tier manual (override billing) */
adminUsersRoute.patch("/organizations/:id", async (c) => {
  try {
    const ctx = await requirePlatformAdmin(c);
    const input = z
      .object({
        tier: z.enum(["free", "pro", "business", "enterprise"]),
        status: z
          .enum(["inactive", "pending", "active", "failed", "expired", "canceled"])
          .optional(),
      })
      .parse(await c.req.json());

    const orgId = c.req.param("id");
    const now = new Date();

    await db
      .insert(subscription)
      .values({
        id: generateId("sub"),
        organizationId: orgId,
        tier: input.tier,
        status: input.status ?? "active",
        currentPeriodStart: now,
      })
      .onConflictDoUpdate({
        target: subscription.organizationId,
        set: {
          tier: input.tier,
          status: input.status ?? "active",
          currentPeriodStart: now,
          updatedAt: now,
        },
      });

    logAdminAction(c, ctx.user.id, {
      action: "organization.set_tier",
      entityType: "organization",
      entityId: orgId,
      organizationId: orgId,
      metadata: { ...input },
    });

    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- Plans ----------
