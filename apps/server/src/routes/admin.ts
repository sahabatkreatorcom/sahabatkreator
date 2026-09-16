// API Admin — statistik platform, user & org management, plans, credentials, settings

import { auth } from "@sahabatkreator/auth";
import { db } from "@sahabatkreator/db";
import {
  activityLog,
  aiUsageLog,
  auditLog,
  bridgeConfig,
  engagementItem,
  holiday,
  member,
  organization,
  payment,
  plan,
  platformCredential,
  platformEnum,
  platformHealth,
  platformSettings,
  post,
  socialAccount,
  subscription,
  user as userTable,
  webhookLog,
} from "@sahabatkreator/db/schema";
import { env } from "@sahabatkreator/env/server";
import { REPLIZ_PLATFORMS } from "@sahabatkreator/publishing";
import { and, asc, count, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { fireActivity } from "../lib/activity-log";
import { invalidateAiConfigCache } from "../lib/ai";
import { logAdminAction } from "../lib/audit";
import { errorResponse, requirePlatformAdmin } from "../lib/auth-guard";
import { decrypt, encrypt } from "../lib/crypto";
import { parseCsv } from "../lib/csv-import";
import { generateId } from "../lib/id";
import {
  getSumopodConfig,
  invalidateSumopodConfigCache,
  isSumopodConfigured,
} from "../lib/sumopod";

export const adminRoute = new Hono();

/** Parse query param tanggal (YYYY-MM-DD) → Date. `endOfDay` menyetel jam 23:59:59.999. */
function parseDateParam(value: string | undefined, endOfDay = false): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date;
}

/** GET /admin/stats — dashboard statistik platform */
adminRoute.get("/stats", async (c) => {
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
adminRoute.get("/users", async (c) => {
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
adminRoute.patch("/users/:id", async (c) => {
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
adminRoute.post("/users/:id/impersonate", async (c) => {
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
adminRoute.post("/impersonate/exit", async (c) => {
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
adminRoute.get("/impersonate/status", async (c) => {
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
adminRoute.post("/users/:id/revoke-sessions", async (c) => {
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
adminRoute.get("/organizations", async (c) => {
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
adminRoute.patch("/organizations/:id", async (c) => {
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

/** GET /admin/plans — semua plan (termasuk non-aktif) */
adminRoute.get("/plans", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const plans = await db.select().from(plan).orderBy(plan.sortOrder);
    return c.json({ plans });
  } catch (error) {
    return errorResponse(error);
  }
});

const planUpsertSchema = z.object({
  tier: z.enum(["free", "pro", "business", "enterprise"]),
  name: z.string().min(1).max(100),
  description: z.string().max(300).optional().nullable(),
  priceIdr: z.number().int().min(0),
  billingIntervalMonths: z.number().int().min(1).max(12),
  maxSocialAccounts: z.number().int().min(0),
  maxScheduledPostsPerMonth: z.number().int().min(0),
  maxTeamMembers: z.number().int().min(1),
  maxMediaStorageMb: z.number().int().min(0),
  aiCreditsPerMonth: z.number().int().min(0),
  features: z.array(z.string().max(100)).max(20),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0),
});

/** POST /admin/plans — buat/update plan (upsert by tier+interval) */
adminRoute.post("/plans", async (c) => {
  try {
    const ctx = await requirePlatformAdmin(c);
    const input = planUpsertSchema.parse(await c.req.json());

    const id = generateId("plan");
    await db
      .insert(plan)
      .values({ id, ...input })
      .onConflictDoUpdate({
        target: [plan.tier, plan.billingIntervalMonths],
        set: { ...input, updatedAt: new Date() },
      });

    logAdminAction(c, ctx.user.id, {
      action: "plan.upsert",
      entityType: "plan",
      entityId: `${input.tier}:${input.billingIntervalMonths}m`,
      metadata: { ...input },
    });

    return c.json({ ok: true }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- Platform credentials (OAuth apps per platform) ----------

/** GET /admin/platform-credentials — list (secret tidak dikembalikan) */
adminRoute.get("/platform-credentials", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const credentials = await db
      .select({
        id: platformCredential.id,
        platform: platformCredential.platform,
        clientId: platformCredential.clientId,
        redirectUri: platformCredential.redirectUri,
        extraConfigEnc: platformCredential.extraConfigEnc,
        isActive: platformCredential.isActive,
        updatedAt: platformCredential.updatedAt,
      })
      .from(platformCredential)
      .orderBy(platformCredential.platform);
    return c.json({
      credentials: credentials.map(({ extraConfigEnc, ...cred }) => ({
        ...cred,
        webhookVerifyTokenConfigured: (() => {
          if (!extraConfigEnc) return false;
          try {
            const extra = JSON.parse(decrypt(extraConfigEnc)) as Record<string, unknown>;
            return Boolean(extra.webhookVerifyToken);
          } catch {
            return false;
          }
        })(),
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
});

const credentialSchema = z.object({
  platform: z.enum(platformEnum.enumValues),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.string().url().optional(),
  // Webhook verify token (Meta/IG/Threads hub handshake) — opsional, kosong = pertahankan lama
  webhookVerifyToken: z.string().optional(),
  // True = hapus verify token tersimpan (kembali pakai env)
  deleteWebhookVerifyToken: z.boolean().optional(),
});

/** POST /admin/platform-credentials — simpan kredensial (secret & verify token dienkripsi) */
adminRoute.post("/platform-credentials", async (c) => {
  try {
    const ctx = await requirePlatformAdmin(c);
    const input = credentialSchema.parse(await c.req.json());

    // Verify token disimpan di extraConfigEnc (JSON terenkripsi). Bila field
    // kosong: pertahankan yang lama; deleteWebhookVerifyToken: hapus.
    const [existing] = await db
      .select({ extraConfigEnc: platformCredential.extraConfigEnc })
      .from(platformCredential)
      .where(eq(platformCredential.platform, input.platform))
      .limit(1);

    let extraConfigEnc: string | null = existing?.extraConfigEnc ?? null;
    const newToken = input.webhookVerifyToken?.trim();
    if (newToken || input.deleteWebhookVerifyToken) {
      let extra: Record<string, unknown> = {};
      if (existing?.extraConfigEnc) {
        try {
          extra = JSON.parse(decrypt(existing.extraConfigEnc)) as Record<string, unknown>;
        } catch {
          extra = {};
        }
      }
      if (newToken) {
        extra.webhookVerifyToken = newToken;
      } else {
        delete extra.webhookVerifyToken;
      }
      extraConfigEnc = Object.keys(extra).length > 0 ? encrypt(JSON.stringify(extra)) : null;
    }

    await db
      .insert(platformCredential)
      .values({
        id: generateId("cred"),
        platform: input.platform,
        clientId: input.clientId,
        clientSecretEnc: encrypt(input.clientSecret),
        redirectUri: input.redirectUri ?? null,
        extraConfigEnc,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: platformCredential.platform,
        set: {
          clientId: input.clientId,
          clientSecretEnc: encrypt(input.clientSecret),
          redirectUri: input.redirectUri ?? null,
          extraConfigEnc,
          isActive: true,
          updatedAt: new Date(),
        },
      });

    // Audit: clientId saja — secret tidak boleh masuk log
    logAdminAction(c, ctx.user.id, {
      action: "platform_credential.update",
      entityType: "platform_credential",
      entityId: input.platform,
      metadata: { clientId: input.clientId, redirectUri: input.redirectUri ?? null },
    });

    return c.json({ ok: true }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /admin/platform-credentials/:platform */
adminRoute.delete("/platform-credentials/:platform", async (c) => {
  try {
    const ctx = await requirePlatformAdmin(c);
    const platform = c.req.param("platform") as (typeof platformEnum.enumValues)[number];
    await db.delete(platformCredential).where(eq(platformCredential.platform, platform));

    logAdminAction(c, ctx.user.id, {
      action: "platform_credential.delete",
      entityType: "platform_credential",
      entityId: platform,
    });

    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- Bridge config (Repliz) — publish sementara via API pihak ketiga ----------

/** GET /admin/bridge-config — status bridge + routing (secret tidak dikembalikan) */
adminRoute.get("/bridge-config", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const [row] = await db
      .select()
      .from(bridgeConfig)
      .where(eq(bridgeConfig.provider, "repliz"))
      .limit(1);
    return c.json({
      bridge: row
        ? {
            provider: row.provider,
            accessKey: row.accessKey,
            isActive: row.isActive,
            routing: row.routing ?? {},
            updatedAt: row.updatedAt,
            secretConfigured: true,
          }
        : null,
      supportedPlatforms: Object.keys(REPLIZ_PLATFORMS),
    });
  } catch (error) {
    return errorResponse(error);
  }
});

const bridgeSchema = z.object({
  accessKey: z.string().min(1),
  secretKey: z.string().min(1).optional(), // kosong = pertahankan secret lama
  isActive: z.boolean().default(true),
  routing: z.record(z.string(), z.enum(["native", "repliz"])).default({}),
});

/** POST /admin/bridge-config — simpan kredensial + routing per platform */
adminRoute.post("/bridge-config", async (c) => {
  try {
    const ctx = await requirePlatformAdmin(c);
    const input = bridgeSchema.parse(await c.req.json());

    // Validasi routing: hanya platform yang didukung Repliz
    const supported = Object.keys(REPLIZ_PLATFORMS) as string[];
    const invalid = Object.entries(input.routing).filter(
      ([platform, mode]) => mode === "repliz" && !supported.includes(platform),
    );
    if (invalid.length > 0) {
      return c.json(
        { message: `Platform tidak didukung Repliz: ${invalid.map(([p]) => p).join(", ")}` },
        400,
      );
    }

    const [existing] = await db
      .select({ secretEnc: bridgeConfig.secretEnc })
      .from(bridgeConfig)
      .where(eq(bridgeConfig.provider, "repliz"))
      .limit(1);

    const secretEnc = input.secretKey ? encrypt(input.secretKey) : existing?.secretEnc;
    if (!secretEnc) {
      return c.json({ message: "Secret key wajib diisi saat pertama kali setup" }, 400);
    }

    await db
      .insert(bridgeConfig)
      .values({
        id: generateId("bridge"),
        provider: "repliz",
        accessKey: input.accessKey,
        secretEnc,
        isActive: input.isActive,
        routing: input.routing,
      })
      .onConflictDoUpdate({
        target: bridgeConfig.provider,
        set: {
          accessKey: input.accessKey,
          secretEnc,
          isActive: input.isActive,
          routing: input.routing,
          updatedAt: new Date(),
        },
      });

    // Audit: accessKey saja — secret tidak masuk log
    logAdminAction(c, ctx.user.id, {
      action: "bridge_config.update",
      entityType: "bridge_config",
      entityId: "repliz",
      metadata: { accessKey: input.accessKey, isActive: input.isActive, routing: input.routing },
    });

    return c.json({ ok: true }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- Platform settings ----------

/** GET /admin/settings */
adminRoute.get("/settings", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const [settings] = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.id, "singleton"))
      .limit(1);
    if (!settings) return c.json({ settings: null });
    // Jangan pernah kirim key terenkripsi ke client — cukup flag terkonfigurasi
    const { aiApiKeyEnc, ...safe } = settings;
    return c.json({ settings: { ...safe, aiConfigured: !!aiApiKeyEnc } });
  } catch (error) {
    return errorResponse(error);
  }
});

const settingsSchema = z.object({
  registrationEnabled: z.boolean().optional(),
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().max(500).optional().nullable(),
  supportEmail: z.string().email().optional().nullable(),
  // Konfigurasi AI (OpenRouter) — key dikirim plaintext, disimpan terenkripsi
  aiApiKey: z.string().optional().nullable(),
  aiModel: z.string().optional().nullable(),
  // Konfigurasi kolaborasi (Collab IG)
  collabEnabled: z.boolean().optional(),
  collabMaxCollaborators: z.number().int().min(1).max(20).optional(),
  collabAllowExternalCollaborators: z.boolean().optional(),
  collabAutoAcceptInvites: z.boolean().optional(),
  collabInviteMessage: z.string().max(500).optional().nullable(),
});

/** PATCH /admin/settings — update platform settings (singleton upsert) */
adminRoute.patch("/settings", async (c) => {
  try {
    const ctx = await requirePlatformAdmin(c);
    const input = settingsSchema.parse(await c.req.json());

    // Pecah field AI agar key dienkripsi sebelum disimpan
    const { aiApiKey, ...rest } = input;
    const values: Record<string, unknown> = { ...rest };
    if (aiApiKey !== undefined) {
      values.aiApiKeyEnc = aiApiKey ? encrypt(aiApiKey) : null;
    }

    await db
      .insert(platformSettings)
      .values({ id: "singleton", ...values })
      .onConflictDoUpdate({
        target: platformSettings.id,
        set: { ...values, updatedAt: new Date() },
      });

    // Audit: hanya field yang berubah — value AI key tidak pernah masuk log
    logAdminAction(c, ctx.user.id, {
      action: "platform_settings.update",
      entityType: "platform_settings",
      entityId: "singleton",
      metadata: {
        ...rest,
        ...(aiApiKey !== undefined ? { aiApiKeyChanged: true, aiApiKeyCleared: !aiApiKey } : {}),
      },
    });

    // Invalidate cache konfigurasi AI agar key/model baru langsung aktif
    // (pola sama dengan invalidateSumopodConfigCache di payment-config)
    if (aiApiKey !== undefined || input.aiModel !== undefined) {
      invalidateAiConfigCache();
    }

    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- Konfigurasi pembayaran (Sumopod Pay) ----------
// Adaptasi stripe-config reference: secret encrypted + masked, DB → env fallback.

/** Mask secret: hanya 4 karakter terakhir yang terlihat */
function maskSecret(secret: string): string {
  return `****${secret.slice(-4)}`;
}

/** GET /admin/payment-config — status konfigurasi (secret di-mask) */
adminRoute.get("/payment-config", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const [settings] = await db
      .select({
        sumopodApiBaseUrl: platformSettings.sumopodApiBaseUrl,
        sumopodApiKeyEnc: platformSettings.sumopodApiKeyEnc,
        sumopodWebhookTokenEnc: platformSettings.sumopodWebhookTokenEnc,
      })
      .from(platformSettings)
      .where(eq(platformSettings.id, "singleton"))
      .limit(1);

    const config = await getSumopodConfig();
    return c.json({
      configured: config !== null,
      source: config?.source ?? null,
      apiBaseUrl: config?.apiBaseUrl ?? null,
      // Secret tidak pernah dikirim balik — hanya mask indikatif
      apiKeyMasked: settings?.sumopodApiKeyEnc
        ? "****tersimpan"
        : env.SUMOPOD_API_KEY
          ? maskSecret(env.SUMOPOD_API_KEY)
          : null,
      webhookTokenConfigured: Boolean(
        settings?.sumopodWebhookTokenEnc || env.SUMOPOD_WEBHOOK_TOKEN,
      ),
    });
  } catch (error) {
    return errorResponse(error);
  }
});

const paymentConfigSchema = z.object({
  apiBaseUrl: z.url().optional().nullable(),
  // Secret dikirim plaintext, disimpan terenkripsi; kosong/null = hapus
  apiKey: z.string().min(1).optional().nullable(),
  webhookToken: z.string().min(1).optional().nullable(),
});

/** PATCH /admin/payment-config — simpan konfigurasi pembayaran (singleton upsert) */
adminRoute.patch("/payment-config", async (c) => {
  try {
    const ctx = await requirePlatformAdmin(c);
    const input = paymentConfigSchema.parse(await c.req.json());

    const values: Record<string, unknown> = {};
    if (input.apiBaseUrl !== undefined) {
      values.sumopodApiBaseUrl = input.apiBaseUrl;
    }
    if (input.apiKey !== undefined) {
      values.sumopodApiKeyEnc = input.apiKey ? encrypt(input.apiKey) : null;
    }
    if (input.webhookToken !== undefined) {
      values.sumopodWebhookTokenEnc = input.webhookToken ? encrypt(input.webhookToken) : null;
    }

    await db
      .insert(platformSettings)
      .values({ id: "singleton", ...values })
      .onConflictDoUpdate({
        target: platformSettings.id,
        set: { ...values, updatedAt: new Date() },
      });

    invalidateSumopodConfigCache();

    // Audit: nilai secret tidak pernah masuk log
    logAdminAction(c, ctx.user.id, {
      action: "payment_config.update",
      entityType: "platform_settings",
      entityId: "singleton",
      metadata: {
        apiBaseUrl: input.apiBaseUrl ?? null,
        apiKeyChanged: input.apiKey !== undefined,
        apiKeyCleared: input.apiKey === null || input.apiKey === "",
        webhookTokenChanged: input.webhookToken !== undefined,
        webhookTokenCleared: input.webhookToken === null || input.webhookToken === "",
      },
    });

    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /admin/payment-config — hapus konfigurasi pembayaran dari DB (kembali ke env) */
adminRoute.delete("/payment-config", async (c) => {
  try {
    const ctx = await requirePlatformAdmin(c);
    const values = {
      sumopodApiBaseUrl: null,
      sumopodApiKeyEnc: null,
      sumopodWebhookTokenEnc: null,
    };
    await db
      .insert(platformSettings)
      .values({ id: "singleton", ...values })
      .onConflictDoUpdate({
        target: platformSettings.id,
        set: { ...values, updatedAt: new Date() },
      });

    invalidateSumopodConfigCache();
    logAdminAction(c, ctx.user.id, {
      action: "payment_config.delete",
      entityType: "platform_settings",
      entityId: "singleton",
    });
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /admin/payment-config/test — tes koneksi API Sumopod */
adminRoute.post("/payment-config/test", async (c) => {
  try {
    await requirePlatformAdmin(c);
    if (!(await isSumopodConfigured())) {
      return c.json({ success: false, message: "Belum dikonfigurasi" }, 400);
    }
    const config = await getSumopodConfig();
    // Tes: hit endpoint payments dengan payload tidak valid — key benar → 422 (validasi),
    // key salah → 401. Cukup membedakan kredensial valid tanpa membuat payment riil.
    const res = await fetch(`${config!.apiBaseUrl}/api/v1/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": config!.apiKey },
      body: JSON.stringify({ order_id: "sk_test_connection" }),
    });
    if (res.status === 401 || res.status === 403) {
      return c.json({ success: false, message: "API key ditolak Sumopod" }, 200);
    }
    const mode = config!.apiBaseUrl.includes("sandbox") ? "sandbox" : "production";
    return c.json({ success: true, mode });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /admin/logs — audit log terbaru (opsional filter ?action= & ?entityType=) */
adminRoute.get("/logs", async (c) => {
  try {
    await requirePlatformAdmin(c);

    const conditions = [];
    const actionFilter = c.req.query("action");
    const entityFilter = c.req.query("entityType");
    if (actionFilter) conditions.push(eq(auditLog.action, actionFilter));
    if (entityFilter) conditions.push(eq(auditLog.entityType, entityFilter));

    const logs = await db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        metadata: auditLog.metadata,
        ipAddress: auditLog.ipAddress,
        createdAt: auditLog.createdAt,
        userName: userTable.name,
        userEmail: userTable.email,
      })
      .from(auditLog)
      .leftJoin(userTable, eq(auditLog.userId, userTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(auditLog.createdAt))
      .limit(100);
    return c.json({ logs });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /admin/webhook-logs — log webhook Sumopod */
adminRoute.get("/webhook-logs", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const logs = await db.select().from(webhookLog).orderBy(desc(webhookLog.createdAt)).limit(100);
    return c.json({ logs });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- Activity log org (M14) ----------

/**
 * GET /admin/org-activity — daftar aktivitas org terbaru.
 * Query param: orgId (filter org), page (paginasi, 50/halaman).
 */
adminRoute.get("/org-activity", async (c) => {
  try {
    await requirePlatformAdmin(c);

    const orgId = c.req.query("orgId");
    const page = Math.max(Number(c.req.query("page") ?? 1), 1);
    const perPage = 50;

    const conditions = [];
    if (orgId) conditions.push(eq(activityLog.organizationId, orgId));

    const logs = await db
      .select({
        id: activityLog.id,
        organizationId: activityLog.organizationId,
        organizationName: organization.name,
        userId: activityLog.userId,
        userName: userTable.name,
        userEmail: userTable.email,
        action: activityLog.action,
        targetType: activityLog.targetType,
        targetId: activityLog.targetId,
        metadata: activityLog.metadata,
        createdAt: activityLog.createdAt,
      })
      .from(activityLog)
      .leftJoin(organization, eq(activityLog.organizationId, organization.id))
      .leftJoin(userTable, eq(activityLog.userId, userTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(activityLog.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage);

    const [total] = await db
      .select({ total: count() })
      .from(activityLog)
      .where(conditions.length ? and(...conditions) : undefined);

    return c.json({
      logs,
      total: total?.total ?? 0,
      page,
      perPage,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /admin/org-activity/orgs — daftar org (id + nama) utk dropdown filter */
adminRoute.get("/org-activity/orgs", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const orgs = await db
      .select({ id: organization.id, name: organization.name, slug: organization.slug })
      .from(organization)
      .orderBy(organization.name)
      .limit(500);
    return c.json({ organizations: orgs });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- Billing stats ----------

/** GET /admin/billing/stats — MRR, pembayaran sukses/gagal */
adminRoute.get("/billing/stats", async (c) => {
  try {
    await requirePlatformAdmin(c);

    const [completed] = await db
      .select({
        total: sql<number>`coalesce(sum(${payment.amount}), 0)::bigint`,
        count: count(),
      })
      .from(payment)
      .where(eq(payment.status, "completed"));

    const [failed] = await db
      .select({ total: count() })
      .from(payment)
      .where(eq(payment.status, "failed"));

    const [pending] = await db
      .select({ total: count() })
      .from(payment)
      .where(eq(payment.status, "pending"));

    // MRR sederhana: sum harga plan bulanan yang aktif
    const [mrr] = await db
      .select({
        total: sql<number>`coalesce(sum(${plan.priceIdr} / ${plan.billingIntervalMonths}), 0)::bigint`,
      })
      .from(subscription)
      .innerJoin(plan, eq(subscription.planId, plan.id))
      .where(and(eq(subscription.status, "active"), eq(plan.billingIntervalMonths, 1)));

    return c.json({
      totalRevenue: Number(completed?.total ?? 0),
      completedCount: completed?.count ?? 0,
      failedCount: failed?.total ?? 0,
      pendingCount: pending?.total ?? 0,
      mrr: Number(mrr?.total ?? 0),
    });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- Billing overview per org ----------

/**
 * GET /admin/billing/overview — daftar org dengan plan & status langganan.
 * Query: search (filter nama org), page, perPage.
 * MRR estimasi per org = harga plan dibagi interval penagihan (dinormalisasi ke bulanan).
 * Org tanpa langganan tercatat dianggap tier free / status inactive.
 */
adminRoute.get("/billing/overview", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const search = c.req.query("search")?.trim() ?? "";
    const page = Math.max(Number(c.req.query("page") ?? 1), 1);
    const perPage = Math.min(Number(c.req.query("perPage") ?? 20), 100);

    const conditions = search ? [ilike(organization.name, `%${search}%`)] : [];

    const rows = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logo: organization.logo,
        createdAt: organization.createdAt,
        tier: subscription.tier,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        trialEndsAt: subscription.trialEndsAt,
        planName: plan.name,
        priceIdr: plan.priceIdr,
        billingIntervalMonths: plan.billingIntervalMonths,
        memberCount: sql<number>`(select count(*)::int from ${member} where ${member.organizationId} = ${organization.id})`,
      })
      .from(organization)
      .leftJoin(subscription, eq(subscription.organizationId, organization.id))
      .leftJoin(plan, eq(subscription.planId, plan.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(organization.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage);

    // MRR estimasi per org + status tampilan yang dinormalisasi:
    // - trial masih berjalan (trialEndsAt > sekarang) → "trialing"
    // - pembayaran gagal (failed) tapi belum dibatalkan → "past_due"
    // - sisanya mengikuti status enum subscription
    const now = Date.now();
    const organizations = rows.map((row) => {
      // Status tampilan adalah string bebas (bukan enum DB) — nilai tambahan
      // "trialing"/"past_due"/"inactive" hanya untuk UI, bukan disimpan ke DB
      let displayStatus: string = row.status ?? "inactive";
      if (row.trialEndsAt && row.trialEndsAt.getTime() > now) {
        displayStatus = "trialing";
      } else if (row.status === "failed") {
        displayStatus = "past_due";
      }
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        logo: row.logo,
        createdAt: row.createdAt,
        tier: row.tier ?? "free",
        status: displayStatus,
        currentPeriodStart: row.currentPeriodStart,
        currentPeriodEnd: row.currentPeriodEnd,
        trialEndsAt: row.trialEndsAt,
        planName: row.planName,
        memberCount: row.memberCount,
        // Hanya org berstatus aktif yang menyumbang MRR; free plan (harga 0) tidak
        mrr:
          row.status === "active" && row.priceIdr !== null && row.billingIntervalMonths
            ? Math.round(row.priceIdr / row.billingIntervalMonths)
            : 0,
      };
    });

    // Kartu ringkasan — dihitung dari seluruh dataset (tanpa filter search)
    // agar angka konsisten dengan total platform meski user sedang mencari.
    // Status tampilan dinormalisasi di SQL (trial aktif → trialing, failed → past_due).
    const summaries = await db
      .select({
        displayStatus: sql<string>`case
          when ${subscription.trialEndsAt} is not null and ${subscription.trialEndsAt} > now() then 'trialing'
          when ${subscription.status} = 'failed' then 'past_due'
          else ${subscription.status}::text
        end`,
        orgCount: count(),
        // Sum harga bulanan plan untuk MRR total (interval dinormalisasi di SQL)
        mrr: sql<number>`coalesce(sum(case when ${subscription.status} = 'active' and ${plan.priceIdr} is not null then ${plan.priceIdr} / ${plan.billingIntervalMonths} else 0 end), 0)::bigint`,
      })
      .from(subscription)
      .leftJoin(plan, eq(subscription.planId, plan.id))
      .groupBy(sql`1`);

    let totalMrr = 0;
    let activeCount = 0;
    let trialingCount = 0;
    let pastDueCount = 0;
    for (const s of summaries) {
      totalMrr += Number(s.mrr ?? 0);
      if (s.displayStatus === "active") activeCount = s.orgCount;
      if (s.displayStatus === "trialing") trialingCount = s.orgCount;
      if (s.displayStatus === "past_due") pastDueCount = s.orgCount;
    }

    const [total] = await db
      .select({ total: count() })
      .from(organization)
      .where(conditions.length ? and(...conditions) : undefined);

    return c.json({
      organizations,
      summary: {
        totalMrr,
        activeCount,
        trialingCount,
        pastDueCount,
      },
      total: total?.total ?? 0,
      page,
      perPage,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- Holiday (kalender hari besar) ----------

/** GET /admin/ai-usage — log pemakaian AI semua org (filter action/platform/org/tanggal), paginasi */
adminRoute.get("/ai-usage", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const page = Math.max(Number(c.req.query("page") ?? 1), 1);
    const perPage = Math.min(Number(c.req.query("perPage") ?? 50), 200);
    const action = c.req.query("action")?.trim() ?? "";
    const platform = c.req.query("platform")?.trim() ?? "";
    const organizationId = c.req.query("organizationId")?.trim() ?? "";
    const from = parseDateParam(c.req.query("from"));
    const to = parseDateParam(c.req.query("to"), true);

    const conditions = [];
    if (action) conditions.push(eq(aiUsageLog.action, action));
    if (platform) conditions.push(eq(aiUsageLog.platform, platform));
    if (organizationId) conditions.push(eq(aiUsageLog.organizationId, organizationId));
    if (from) conditions.push(gte(aiUsageLog.createdAt, from));
    if (to) conditions.push(lte(aiUsageLog.createdAt, to));
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: aiUsageLog.id,
        organizationId: aiUsageLog.organizationId,
        organizationName: organization.name,
        userName: userTable.name,
        userEmail: userTable.email,
        action: aiUsageLog.action,
        platform: aiUsageLog.platform,
        model: aiUsageLog.model,
        credits: aiUsageLog.credits,
        createdAt: aiUsageLog.createdAt,
      })
      .from(aiUsageLog)
      .leftJoin(organization, eq(aiUsageLog.organizationId, organization.id))
      .leftJoin(userTable, eq(aiUsageLog.userId, userTable.id))
      .where(where)
      .orderBy(desc(aiUsageLog.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage);

    const [total] = await db.select({ total: count() }).from(aiUsageLog).where(where);
    const [sum] = await db
      .select({ credits: sql<number>`coalesce(sum(${aiUsageLog.credits}), 0)::int` })
      .from(aiUsageLog)
      .where(where);

    return c.json({
      logs: rows,
      total: total?.total ?? 0,
      page,
      perPage,
      summary: { credits: sum?.credits ?? 0 },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- Holiday (kalender hari besar) ----------

/** GET /admin/holidays — list semua hari besar (termasuk non-aktif), paginasi + filter */
adminRoute.get("/holidays", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const page = Math.max(Number(c.req.query("page") ?? 1), 1);
    const perPage = Math.min(Number(c.req.query("perPage") ?? 50), 200);
    const search = c.req.query("search")?.trim() ?? "";
    const month = Number(c.req.query("month"));

    const conditions = [];
    if (search) conditions.push(ilike(holiday.name, `%${search}%`));
    if (month >= 1 && month <= 12) conditions.push(eq(holiday.month, month));
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await db
      .select()
      .from(holiday)
      .where(where)
      .orderBy(asc(holiday.month), asc(holiday.day))
      .limit(perPage)
      .offset((page - 1) * perPage);

    const [total] = await db.select({ total: count() }).from(holiday).where(where);

    return c.json({ holidays: rows, total: total?.total ?? 0, page, perPage });
  } catch (error) {
    return errorResponse(error);
  }
});

const holidayInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  scope: z.enum(["national", "international"]),
  category: z.string().max(50).optional(),
  ideaTemplates: z
    .array(z.object({ angle: z.string().max(200), example: z.string().max(500) }))
    .max(10)
    .optional()
    .nullable(),
  suggestedHashtags: z.array(z.string().max(100)).max(20).optional().nullable(),
  isActive: z.boolean().optional(),
});

/** POST /admin/holidays — buat hari besar baru */
adminRoute.post("/holidays", async (c) => {
  try {
    const ctx = await requirePlatformAdmin(c);
    const input = holidayInputSchema.parse(await c.req.json());

    const id = generateId("holiday");
    await db.insert(holiday).values({ id, ...input, category: input.category ?? "umum" });

    logAdminAction(c, ctx.user.id, {
      action: "holiday.create",
      entityType: "holiday",
      entityId: id,
      metadata: { name: input.name, month: input.month, day: input.day },
    });

    return c.json({ id }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** PATCH /admin/holidays/:id — update hari besar */
adminRoute.patch("/holidays/:id", async (c) => {
  try {
    const ctx = await requirePlatformAdmin(c);
    const input = holidayInputSchema.partial().parse(await c.req.json());
    const id = c.req.param("id");

    const updated = await db
      .update(holiday)
      .set({ ...input })
      .where(eq(holiday.id, id))
      .returning({ id: holiday.id });

    if (updated.length === 0) {
      return c.json({ message: "Hari besar tidak ditemukan" }, 404);
    }

    logAdminAction(c, ctx.user.id, {
      action: "holiday.update",
      entityType: "holiday",
      entityId: id,
      metadata: { ...input },
    });

    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /admin/holidays/:id — hapus hari besar */
adminRoute.delete("/holidays/:id", async (c) => {
  try {
    const ctx = await requirePlatformAdmin(c);
    const id = c.req.param("id");

    const deleted = await db
      .delete(holiday)
      .where(eq(holiday.id, id))
      .returning({ id: holiday.id });

    if (deleted.length === 0) {
      return c.json({ message: "Hari besar tidak ditemukan" }, 404);
    }

    logAdminAction(c, ctx.user.id, {
      action: "holiday.delete",
      entityType: "holiday",
      entityId: id,
      metadata: {},
    });

    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

const holidayImportRowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  scope: z.enum(["national", "international"]),
  category: z.string().optional(),
  isActive: z.boolean().optional(),
});

/** Parse sel "a | b" atau "a; b" → array ter-trim (untuk hashtags CSV) */
function splitList(cell: string): string[] {
  return cell
    .split(/[;|]/)
    .map((s) => s.trim().replace(/^#/, ""))
    .filter(Boolean);
}

/** Parse sel ide konten "angle: example" per baris (multiline) → ideaTemplates */
function parseIdeaTemplates(cell: string): { angle: string; example: string }[] {
  return cell
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const sep = line.indexOf(":");
      if (sep > 0) {
        return { angle: line.slice(0, sep).trim(), example: line.slice(sep + 1).trim() };
      }
      return { angle: line, example: "" };
    })
    .slice(0, 10);
}

/**
 * POST /admin/holidays/import — import massal CSV.
 * Body: multipart form (file) atau JSON { csv: string }.
 * Kolom wajib: name, month, day, scope. Opsional: description, category,
 * suggested_hashtags (pisah ; atau |), idea_templates (multiline "angle: example"),
 * is_active (true/false). Upsert by (month, day, name) — baris duplikat di-update.
 *
 * File .xlsx dikonversi ke CSV di sisi admin UI (SheetJS) sebelum dikirim.
 */
adminRoute.post("/holidays/import", async (c) => {
  try {
    const ctx = await requirePlatformAdmin(c);
    const contentType = c.req.header("content-type") ?? "";

    let csvText = "";
    if (contentType.includes("multipart/form-data")) {
      const form = await c.req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return c.json({ message: "File CSV wajib diupload" }, 400);
      }
      csvText = await file.text();
    } else {
      const body = (await c.req.json()) as { csv?: string };
      csvText = body.csv ?? "";
    }

    const rows = parseCsv(csvText);
    if (rows.length < 2) {
      return c.json({ message: "CSV kosong — butuh header + minimal 1 baris data" }, 400);
    }

    const header = rows[0]!.map((h) => h.trim().toLowerCase());
    const col = (name: string) => header.indexOf(name);
    if (col("name") < 0 || col("month") < 0 || col("day") < 0 || col("scope") < 0) {
      return c.json(
        { message: "Kolom wajib: name, month, day, scope (national|international)" },
        400,
      );
    }

    const results: { row: number; status: "ok" | "error"; message?: string }[] = [];
    let imported = 0;

    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i]!;
      const get = (name: string): string => {
        const idx = col(name);
        return idx >= 0 ? (cells[idx] ?? "").trim() : "";
      };

      const parsed = holidayImportRowSchema.safeParse({
        name: get("name"),
        description: get("description") || null,
        month: Number(get("month")),
        day: Number(get("day")),
        scope: get("scope").toLowerCase(),
        category: get("category") || undefined,
        isActive: get("is_active") ? get("is_active").toLowerCase() === "true" : undefined,
      });

      if (!parsed.success) {
        results.push({
          row: i,
          status: "error",
          message: parsed.error.issues.map((iss) => iss.message).join(", "),
        });
        continue;
      }

      // Validasi kombinasi bulan/tanggal (mis. 31 Feb tidak valid)
      const probe = new Date(2024, parsed.data.month - 1, parsed.data.day);
      if (probe.getMonth() !== parsed.data.month - 1 || probe.getDate() !== parsed.data.day) {
        results.push({ row: i, status: "error", message: "kombinasi bulan/tanggal tidak valid" });
        continue;
      }

      const hashtagsCell = get("suggested_hashtags");
      const ideasCell = get("idea_templates");

      const values = {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        month: parsed.data.month,
        day: parsed.data.day,
        scope: parsed.data.scope,
        category: parsed.data.category ?? "umum",
        ...(hashtagsCell ? { suggestedHashtags: splitList(hashtagsCell) } : {}),
        ...(ideasCell ? { ideaTemplates: parseIdeaTemplates(ideasCell) } : {}),
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      };

      // Upsert by unique index (month, day, name) — duplikat di-update
      await db
        .insert(holiday)
        .values({ id: generateId("holiday"), ...values })
        .onConflictDoUpdate({
          target: [holiday.month, holiday.day, holiday.name],
          set: values,
        });
      imported++;

      results.push({ row: i, status: "ok" });
    }

    logAdminAction(c, ctx.user.id, {
      action: "holiday.import",
      entityType: "holiday",
      entityId: "bulk",
      metadata: { rows: rows.length - 1, imported },
    });

    return c.json({
      totalRows: rows.length - 1,
      okRows: results.filter((r) => r.status === "ok").length,
      errorRows: results.filter((r) => r.status === "error").length,
      imported,
      rows: results,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/monitoring/overview — aggregated monitoring data
// ---------------------------------------------------------------------------

adminRoute.get("/monitoring/overview", requirePlatformAdmin, async (c) => {
  try {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 1. Connected accounts — simple count per platform
    const accountsByPlatform = await db
      .select({
        platform: socialAccount.platform,
        total: count(),
        needsReconnect: sql<number>`cast(sum(case when ${socialAccount.needsReconnect} = true then 1 else 0 end) as int)`,
        tokenExpiringSoon: sql<number>`cast(sum(case when ${socialAccount.tokenExpiresAt} < ${sevenDaysFromNow}::timestamp and ${socialAccount.needsReconnect} = false then 1 else 0 end) as int)`,
      })
      .from(socialAccount)
      .where(eq(socialAccount.isConnected, true))
      .groupBy(socialAccount.platform);

    const totalConnected = accountsByPlatform.reduce((sum, p) => sum + p.total, 0);
    const totalNeedsReconnect = accountsByPlatform.reduce((sum, p) => sum + p.needsReconnect, 0);
    const totalExpiringSoon = accountsByPlatform.reduce((sum, p) => sum + p.tokenExpiringSoon, 0);

    // 2. Platform credentials status
    const credentials = await db
      .select({
        platform: platformCredential.platform,
        isActive: platformCredential.isActive,
        hasClientSecret: sql<boolean>`(length(${platformCredential.clientSecretEnc}) > 0)`,
        hasExtraConfig: sql<boolean>`(length(${platformCredential.extraConfigEnc}) > 0)`,
      })
      .from(platformCredential);

    // 3. Recent posts (last 24h)
    const recentPostsStats = await db
      .select({
        status: post.status,
        total: count(),
      })
      .from(post)
      .where(gte(post.createdAt, twentyFourHoursAgo))
      .groupBy(post.status);

    const recentPostsByStatus: Record<string, number> = {};
    for (const row of recentPostsStats) {
      recentPostsByStatus[row.status] = row.total;
    }

    // Failed posts (last 24h)
    const failedPosts = await db
      .select({
        id: post.id,
        platform: post.platform,
        errorCode: post.errorCode,
        errorMessage: post.errorMessage,
        createdAt: post.createdAt,
        orgId: post.organizationId,
      })
      .from(post)
      .where(and(eq(post.status, "failed"), gte(post.createdAt, twentyFourHoursAgo)))
      .orderBy(desc(post.createdAt))
      .limit(10);

    // 4. Webhook logs (last 24h)
    const webhookStats = await db
      .select({
        result: webhookLog.result,
        total: count(),
      })
      .from(webhookLog)
      .where(gte(webhookLog.createdAt, twentyFourHoursAgo))
      .groupBy(webhookLog.result);

    const webhookByResult: Record<string, number> = {};
    for (const row of webhookStats) {
      webhookByResult[row.result] = row.total;
    }

    // 5. Platform health
    const health = await db
      .select({
        platform: platformHealth.platform,
        status: platformHealth.status,
        message: platformHealth.message,
        checkedAt: platformHealth.checkedAt,
      })
      .from(platformHealth);

    // 6. Engagement (unread items)
    const engagementStats = await db
      .select({
        platform: socialAccount.platform,
        type: engagementItem.type,
        unread: sql<number>`cast(sum(case when ${engagementItem.status} = 'unread' then 1 else 0 end) as int)`,
        total: count(),
      })
      .from(engagementItem)
      .innerJoin(socialAccount, eq(engagementItem.socialAccountId, socialAccount.id))
      .groupBy(socialAccount.platform, engagementItem.type);

    const totalUnread = engagementStats.reduce((sum, e) => sum + e.unread, 0);

    return c.json({
      connectedAccounts: {
        total: totalConnected,
        needsReconnect: totalNeedsReconnect,
        tokenExpiringSoon: totalExpiringSoon,
        byPlatform: accountsByPlatform,
      },
      platformCredentials: credentials,
      recentPosts: {
        last24h: recentPostsByStatus,
        failedPosts,
      },
      webhookLogs: {
        last24h: webhookByResult,
      },
      platformHealth: health,
      engagement: {
        totalUnread,
        byPlatform: engagementStats,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
