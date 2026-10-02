// API Admin — statistik platform, user & org management, plans, credentials, settings

import { db } from "@sahabatkreator/db";
import {
  activityLog,
  aiUsageLog,
  auditLog,
  member,
  organization,
  payment,
  plan,
  subscription,
  user as userTable,
  webhookLog,
} from "@sahabatkreator/db/schema";
import { and, count, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { errorResponse, requirePlatformAdmin } from "../lib/auth-guard";
import { parseDateParam } from "../lib/date";

export const adminBillingRoute = new Hono();
/** GET /admin/logs — audit log terbaru (opsional filter ?action= & ?entityType=) */
adminBillingRoute.get("/logs", async (c) => {
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

/**
 * GET /admin/webhook-logs — 100 log webhook terbaru.
 *
 * Isi tabel `webhook_log` berasal dari dua sumber dengan `eventType` berbeda:
 * - `payment.*` / `unknown` — webhook Sumopod Pay (routes/webhook.ts)
 * - `meta` / `instagram-standalone` / `threads` / `tiktok` — webhook platform
 *   sosial (routes/webhook-platform.ts)
 *
 * Tidak difilter di sini supaya halaman admin bisa menampilkan keduanya;
 * penyaringan dilakukan di UI bila perlu.
 */
adminBillingRoute.get("/webhook-logs", async (c) => {
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
adminBillingRoute.get("/org-activity", async (c) => {
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
adminBillingRoute.get("/org-activity/orgs", async (c) => {
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
adminBillingRoute.get("/billing/stats", async (c) => {
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
adminBillingRoute.get("/billing/overview", async (c) => {
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
adminBillingRoute.get("/ai-usage", async (c) => {
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
