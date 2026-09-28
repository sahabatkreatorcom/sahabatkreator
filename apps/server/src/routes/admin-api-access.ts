// API Admin API Access — tracking pengajuan review app + snapshot kuota API

import { db } from "@sahabatkreator/db";
import {
  type AppReviewStatus,
  type AppReviewStatusEntry,
  apiQuotaSnapshot,
  appReviewTracking,
} from "@sahabatkreator/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, requirePlatformAdmin } from "../lib/auth-guard";
import { generateId } from "../lib/id";

export const apiAccessRoute = new Hono();

const REVIEW_STATUSES: AppReviewStatus[] = [
  "not_started",
  "preparing",
  "submitted",
  "in_review",
  "approved",
  "rejected",
  "withdrawn",
];

const CHECKLIST_KEYS = [
  "privacy_policy",
  "privacy_policy_en",
  "terms_of_service",
  "terms_of_service_en",
  "data_deletion",
  "data_deletion_callback",
  "screencast",
  "app_icon_1024",
  "business_verification",
  "demo_credentials",
  "legal_docs",
  "url_verification",
  "webhook_endpoint",
  "token_revocation",
  "linkedin_company_page",
  "youtube_quota_form",
] as const;

const isoDateTime = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD"));

const trackingInput = z.object({
  platform: z.string().min(1).max(50),
  submissionId: z.string().max(200).optional().nullable(),
  permissionScope: z.string().max(200).optional().nullable(),
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional().nullable(),
  status: z.enum(REVIEW_STATUSES as [AppReviewStatus, ...AppReviewStatus[]]).optional(),
  dashboardUrl: z.string().url().max(500).optional().nullable(),
  submittedAt: isoDateTime.optional().nullable(),
  deadlineAt: isoDateTime.optional().nullable(),
  rejectionReason: z.string().max(3000).optional().nullable(),
  /** Catatan saat perubahan status — masuk statusHistory (siapa-kapan-kenapa) */
  statusNote: z.string().max(1000).optional().nullable(),
  checklist: z.record(z.enum(CHECKLIST_KEYS), z.boolean()).optional().nullable(),
  notes: z.record(z.string(), z.unknown()).optional().nullable(),
});

/** GET /admin/api-access/reviews — list tracking + countdown deadline */
apiAccessRoute.get("/reviews", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const statusFilter = c.req.query("status");
    const platformFilter = c.req.query("platform");

    const conditions = [];
    if (statusFilter)
      conditions.push(eq(appReviewTracking.status, statusFilter as AppReviewStatus));
    if (platformFilter) conditions.push(eq(appReviewTracking.platform, platformFilter));

    const rows = await db
      .select()
      .from(appReviewTracking)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(appReviewTracking.updatedAt));

    return c.json({ reviews: rows });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /admin/api-access/reviews — buat entry tracking baru */
apiAccessRoute.post("/reviews", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const input = await c.req.json();
    const data = trackingInput.parse(input);

    const now = new Date();
    const status = data.status ?? "not_started";
    const history: AppReviewStatusEntry[] = [{ status, at: now.toISOString() }];

    const [row] = await db
      .insert(appReviewTracking)
      .values({
        id: generateId("apprev"),
        platform: data.platform,
        submissionId: data.submissionId ?? null,
        permissionScope: data.permissionScope ?? null,
        title: data.title,
        description: data.description ?? null,
        status,
        dashboardUrl: data.dashboardUrl ?? null,
        submittedAt: data.submittedAt ? new Date(data.submittedAt) : null,
        deadlineAt: data.deadlineAt ? new Date(data.deadlineAt) : null,
        rejectionReason: data.rejectionReason ?? null,
        checklist: data.checklist ?? null,
        notes: data.notes ?? null,
        statusHistory: history,
      })
      .returning();

    return c.json({ review: row }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** PATCH /admin/api-access/reviews/:id — update (status → append statusHistory) */
apiAccessRoute.patch("/reviews/:id", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const id = c.req.param("id");
    const input = await c.req.json();

    // Ambil history lama untuk append
    const [existing] = await db
      .select({ statusHistory: appReviewTracking.statusHistory })
      .from(appReviewTracking)
      .where(eq(appReviewTracking.id, id));
    if (!existing) {
      return c.json({ error: "Tracking tidak ditemukan" }, 404);
    }

    const data = trackingInput.partial().parse(input);
    const update: Record<string, unknown> = {};

    if (data.status !== undefined) {
      update.status = data.status;
      // Append riwayat status bila berubah — sertakan note bila diisi
      if (data.status !== existing.statusHistory?.at(-1)?.status) {
        const history = [...(existing.statusHistory ?? [])];
        const entry: AppReviewStatusEntry = { status: data.status, at: new Date().toISOString() };
        if (data.statusNote) entry.note = data.statusNote;
        history.push(entry);
        update.statusHistory = history;
      }
      // Status final → isi resolvedAt otomatis
      if (data.status === "approved" || data.status === "rejected" || data.status === "withdrawn") {
        update.resolvedAt = new Date();
      }
    }
    if (data.platform !== undefined) update.platform = data.platform;
    if (data.submissionId !== undefined) update.submissionId = data.submissionId;
    if (data.permissionScope !== undefined) update.permissionScope = data.permissionScope;
    if (data.title !== undefined) update.title = data.title;
    if (data.description !== undefined) update.description = data.description;
    if (data.dashboardUrl !== undefined) update.dashboardUrl = data.dashboardUrl;
    if (data.submittedAt !== undefined) {
      update.submittedAt = data.submittedAt ? new Date(data.submittedAt) : null;
    }
    if (data.deadlineAt !== undefined) {
      update.deadlineAt = data.deadlineAt ? new Date(data.deadlineAt) : null;
    }
    if (data.rejectionReason !== undefined) update.rejectionReason = data.rejectionReason;
    if (data.checklist !== undefined) update.checklist = data.checklist;
    if (data.notes !== undefined) update.notes = data.notes;

    const [row] = await db
      .update(appReviewTracking)
      .set(update)
      .where(eq(appReviewTracking.id, id))
      .returning();

    return c.json({ review: row });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /admin/api-access/reviews/:id */
apiAccessRoute.delete("/reviews/:id", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const id = c.req.param("id");
    await db.delete(appReviewTracking).where(eq(appReviewTracking.id, id));
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /admin/api-access/quotas — snapshot kuota terakhir per entity + tren 7 hari */
apiAccessRoute.get("/quotas", async (c) => {
  try {
    await requirePlatformAdmin(c);

    // Snapshot terbaru per (entityId, quotaType) — pakai DISTINCT ON via raw SQL
    const latest = await db.execute<{
      id: string;
      platform: string;
      entity_id: string;
      quota_type: string;
      remaining: number;
      total: number;
      date: string;
      synced_at: Date;
    }>(sql`
      SELECT DISTINCT ON (entity_id, quota_type)
        id, platform, entity_id, quota_type, remaining, total, date, synced_at
      FROM api_quota_snapshot
      ORDER BY entity_id, quota_type, date DESC, synced_at DESC
    `);

    // Tren 7 hari terakhir (untuk sparkline pemakaian)
    const since = new Date(Date.now() - 7 * 86400000);
    const sinceDate = since.toISOString().slice(0, 10);
    const trend = await db
      .select({
        date: apiQuotaSnapshot.date,
        platform: apiQuotaSnapshot.platform,
        quotaType: apiQuotaSnapshot.quotaType,
        usedPct: sql<number>`avg(
          case when total > 0 then (100 * (total - remaining)) / total else 0 end
        )::int`,
      })
      .from(apiQuotaSnapshot)
      .where(gte(apiQuotaSnapshot.date, sinceDate))
      .groupBy(apiQuotaSnapshot.date, apiQuotaSnapshot.platform, apiQuotaSnapshot.quotaType)
      .orderBy(desc(apiQuotaSnapshot.date));

    return c.json({ quotas: latest.rows, trend });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /admin/api-access/quotas — input manual snapshot (dipakai bila worker belum sync) */
apiAccessRoute.post("/quotas", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const data = z
      .object({
        platform: z.string().min(1).max(50),
        entityId: z.string().min(1).max(200),
        quotaType: z.string().min(1).max(100),
        remaining: z.number().int().min(0),
        total: z.number().int().min(1),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .parse(await c.req.json());

    const date = data.date ?? new Date().toISOString().slice(0, 10);

    // Upsert: unique (entityId, quotaType, date) — re-input hari sama = update
    const [row] = await db
      .insert(apiQuotaSnapshot)
      .values({
        id: generateId("quota"),
        platform: data.platform,
        entityId: data.entityId,
        quotaType: data.quotaType,
        remaining: data.remaining,
        total: data.total,
        date,
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [apiQuotaSnapshot.entityId, apiQuotaSnapshot.quotaType, apiQuotaSnapshot.date],
        set: {
          remaining: data.remaining,
          total: data.total,
          platform: data.platform,
          syncedAt: new Date(),
        },
      })
      .returning();

    return c.json({ quota: row }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});
