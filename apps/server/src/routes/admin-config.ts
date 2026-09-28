// API Admin — statistik platform, user & org management, plans, credentials, settings

import { db } from "@sahabatkreator/db";
import {
  bridgeConfig,
  plan,
  platformCredential,
  platformEnum,
  platformSettings,
} from "@sahabatkreator/db/schema";
import { env } from "@sahabatkreator/env/server";
import { REPLIZ_PLATFORMS } from "@sahabatkreator/publishing";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { invalidateAiConfigCache } from "../lib/ai";
import { logAdminAction } from "../lib/audit";
import { errorResponse, requirePlatformAdmin } from "../lib/auth-guard";
import { decrypt, encrypt } from "../lib/crypto";
import { generateId } from "../lib/id";
import {
  getSumopodConfig,
  invalidateSumopodConfigCache,
  isSumopodConfigured,
} from "../lib/sumopod";

export const adminConfigRoute = new Hono();
/** GET /admin/plans — semua plan (termasuk non-aktif) */
adminConfigRoute.get("/plans", async (c) => {
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
  renderCreditsPerMonth: z.number().int().min(0),
  features: z.array(z.string().max(100)).max(20),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0),
});

/** POST /admin/plans — buat/update plan (upsert by tier+interval) */
adminConfigRoute.post("/plans", async (c) => {
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
adminConfigRoute.get("/platform-credentials", async (c) => {
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
adminConfigRoute.post("/platform-credentials", async (c) => {
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
adminConfigRoute.delete("/platform-credentials/:platform", async (c) => {
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
adminConfigRoute.get("/bridge-config", async (c) => {
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
adminConfigRoute.post("/bridge-config", async (c) => {
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
adminConfigRoute.get("/settings", async (c) => {
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
adminConfigRoute.patch("/settings", async (c) => {
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
adminConfigRoute.get("/payment-config", async (c) => {
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
adminConfigRoute.patch("/payment-config", async (c) => {
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
adminConfigRoute.delete("/payment-config", async (c) => {
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
adminConfigRoute.post("/payment-config/test", async (c) => {
  try {
    await requirePlatformAdmin(c);
    if (!(await isSumopodConfigured())) {
      return c.json({ success: false, message: "Belum dikonfigurasi" }, 400);
    }
    const config = await getSumopodConfig();
    // Tes: hit endpoint payments dengan payload tidak valid — key benar → 422 (validasi),
    // key salah → 401. Cukup membedakan kredensial valid tanpa membuat payment riil.
    const res = await fetch(`${config?.apiBaseUrl}/api/v1/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // isSumopodConfigured() di atas menjamin config ada — fallback "" hanya
        // untuk memuaskan tipe (tidak pernah tercapai saat configured).
        "X-Api-Key": config?.apiKey ?? "",
      },
      body: JSON.stringify({ order_id: "sk_test_connection" }),
    });
    if (res.status === 401 || res.status === 403) {
      return c.json({ success: false, message: "API key ditolak Sumopod" }, 200);
    }
    const mode = config?.apiBaseUrl.includes("sandbox") ? "sandbox" : "production";
    return c.json({ success: true, mode });
  } catch (error) {
    return errorResponse(error);
  }
});
